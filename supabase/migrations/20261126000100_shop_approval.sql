-- Shops approved by Takara, an issues view for Takara's dashboard (DECISIONS §27).
--
-- - A new shop starts "pending": its staff can't read or add anything until a Takara admin
--   approves it. Takara can later suspend it (e.g. unpaid) and reactivate it. Every policy is
--   built on private.is_member / private.has_role, so changing those two enforces it everywhere.
-- - A suspended shop's tray links and website stop working too.
-- - The example shop the demo account loads is marked is_demo: always active, left out of the
--   approvals list and of "Needs attention".
-- - admin_shops / admin_shop gain per-shop health counts for "Needs attention".

-- ---------------------------------------------------------------- status

alter table public.shops
  add column status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references auth.users (id) on delete set null,
  add column is_demo boolean not null default false;
-- Every shop that already exists keeps working. The example shops (built by the demo button or
-- the seed script, named "… (demo)") are marked as such.
update public.shops set status = 'active', status_changed_at = now(), is_demo = (name like '%(demo)');
create index shops_status_idx on public.shops (status) where status <> 'active';
-- (Staff can't change these: shops has column-level update grants that don't include them.)

create or replace function private.is_member(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m join public.shops s on s.id = m.shop_id
    where m.shop_id = p_shop and m.user_id = (select auth.uid()) and s.status = 'active'
  )
$$;

create or replace function private.has_role(p_shop uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m join public.shops s on s.id = m.shop_id
    where m.shop_id = p_shop and m.user_id = (select auth.uid()) and m.role = any (p_roles)
      and s.status = 'active'
  )
$$;

-- One shop waiting at a time per person: no piling up requests.
create or replace function public.create_shop(p_name text, p_sku_prefix text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_shop uuid;
  v_prefix text;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if exists (select 1 from public.shops s where s.created_by = v_uid and s.status = 'pending') then
    raise exception 'already_waiting' using errcode = 'P0001';
  end if;
  v_prefix := upper(coalesce(nullif(btrim(p_sku_prefix), ''),
    left(regexp_replace(upper(p_name), '[^A-Z0-9]', '', 'g'), 3)));
  if v_prefix = '' then v_prefix := 'SQ'; end if;
  insert into public.shops (name, sku_prefix, created_by) values (btrim(p_name), v_prefix, v_uid)
    returning id into v_shop;
  insert into public.shop_members (shop_id, user_id, role) values (v_shop, v_uid, 'owner');
  return v_shop;
end $$;

-- The signed-in person's shops that aren't open yet (or were suspended), for the waiting screen.
create function public.my_shop_requests() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'status', s.status, 'role', m.role,
      'created_at', s.created_at, 'status_changed_at', s.status_changed_at)
    order by s.created_at desc), '[]'::jsonb)
  from public.shop_members m join public.shops s on s.id = m.shop_id
  where m.user_id = (select auth.uid()) and s.status <> 'active'
$$;

alter table public.events drop constraint events_name_check;
alter table public.events add constraint events_name_check
  check (name in ('piece_added', 'ai_fill_used', 'share_created', 'share_viewed',
                  'piece_sold', 'tray_created', 'tray_opened', 'shop_status'));

-- Approve, decline (= suspended), suspend or reactivate a shop. Takara admins only; logged.
create function public.admin_set_shop_status(p_shop uuid, p_status text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'suspended') then
    raise exception 'bad status' using errcode = '22023';
  end if;
  select s.status into v_old from public.shops s where s.id = p_shop for update;
  if not found then
    raise exception 'no such shop' using errcode = 'P0002';
  end if;
  if v_old = p_status then
    return p_status;
  end if;
  update public.shops set status = p_status, status_changed_at = now(), status_changed_by = auth.uid()
  where id = p_shop;
  insert into public.events (shop_id, user_id, name, props)
  values (p_shop, auth.uid(), 'shop_status', jsonb_build_object('from', v_old, 'to', p_status));
  return p_status;
end $$;

-- ---------------------------------------------------------------- public links stop for closed shops

create or replace function private.site_shop(p_slug text) returns uuid
language sql stable security definer set search_path = '' as $$
  select ss.shop_id from public.shop_sites ss join public.shops s on s.id = ss.shop_id
  where ss.slug = lower(p_slug) and ss.published and s.status = 'active'
$$;

create or replace function public.get_site(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.shop_sites%rowtype;
  v_shop public.shops%rowtype;
begin
  select * into s from public.shop_sites where shop_id = private.site_shop(p_slug);
  if not found then
    return null;
  end if;
  select * into v_shop from public.shops where id = s.shop_id;
  return jsonb_build_object(
    'shop_id', s.shop_id, 'slug', s.slug, 'name', v_shop.name, 'logo', v_shop.logo_path,
    'price_mode', s.price_mode, 'vat_enabled', v_shop.vat_enabled,
    'whatsapp', s.whatsapp, 'address', s.address, 'maps_url', s.maps_url, 'hours', s.hours,
    'instagram', s.instagram, 'about', s.about, 'updated_at', s.updated_at,
    'rates', private.site_rates(s.shop_id),
    'categories', coalesce((
      select jsonb_object_agg(c.category, c.n)
      from (select p.category, count(*) as n from private.site_visible(s.shop_id) p
            where p.status <> 'sold' group by p.category) c), '{}'::jsonb),
    'total', (select count(*) from private.site_visible(s.shop_id) p where p.status <> 'sold'));
end $$;

-- A sent tray of a shop that isn't active reads as "not found".
create or replace function public.get_share(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.shares%rowtype;
  v_shop public.shops%rowtype;
begin
  if p_token is null or char_length(p_token) <> 22 then
    return null;
  end if;
  select * into s from public.shares where public_token = p_token;
  if not found then
    return null;
  end if;
  select * into v_shop from public.shops where id = s.shop_id;
  if v_shop.status <> 'active' then
    return null;
  end if;
  if s.revoked_at is not null or s.expires_at <= now() then
    return jsonb_build_object('status', 'expired', 'shop', v_shop.name);
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'shop', v_shop.name,
    'logo', v_shop.logo_path,
    'vat_enabled', v_shop.vat_enabled,
    'expires_at', s.expires_at,
    'reply_to', coalesce(
      (select ss.whatsapp from public.shop_sites ss where ss.shop_id = s.shop_id),
      (select pr.phone from public.profiles pr where pr.user_id = s.salesperson_id)),
    'language', coalesce((select c.language::text from public.clients c where c.id = s.client_id), 'en'),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object('karat', r.karat, 'aed_per_g', r.aed_per_g, 'set_at', r.set_at))
      from public.current_gold_rates r where r.shop_id = s.shop_id), '[]'::jsonb),
    'pieces', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'sku', p.sku, 'name', p.name, 'category', p.category, 'karat', p.karat,
          'gross_g', p.gross_g, 'stone_g', p.stone_g, 'making_per_g', p.making_per_g,
          'making_flat', p.making_flat, 'extras_aed', p.extras_aed, 'status', p.status,
          'descriptions', p.descriptions,
          'photo', (select jsonb_build_object('path', m.storage_path, 'thumb', m.thumb_path)
                    from public.piece_media m where m.piece_id = p.id and m.type = 'photo'
                    order by m.created_at limit 1),
          'spin', (select jsonb_build_object('path', m.storage_path, 'small', m.thumb_path, 'frames', m.frames, 'cols', m.cols)
                   from public.piece_media m where m.piece_id = p.id and m.type = 'spin_sprite'
                   order by m.created_at limit 1))
        order by ids.ord)
      from unnest(s.piece_ids) with ordinality as ids(pid, ord)
      join public.pieces p on p.id = ids.pid and p.shop_id = s.shop_id), '[]'::jsonb)
  );
end $$;

create or replace function public.create_tray_from_share(p_token text, p_piece_ids uuid[], p_channel text, p_visitor text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  s public.shares%rowtype;
  v_ids uuid[];
  v_code text;
  v_id uuid;
begin
  if p_token is null or char_length(p_token) <> 22 or p_channel not in ('whatsapp', 'in_store')
     or p_piece_ids is null or cardinality(p_piece_ids) not between 1 and 24
     or char_length(coalesce(p_visitor, '')) > 128 then
    return null;
  end if;
  select * into s from public.shares where public_token = p_token;
  if not found or s.revoked_at is not null or s.expires_at <= now()
     or not exists (select 1 from public.shops sh where sh.id = s.shop_id and sh.status = 'active') then
    return null;
  end if;
  select array_agg(x.pid order by x.ord) into v_ids
  from (
    select distinct on (u.pid) u.pid, u.ord
    from unnest(p_piece_ids) with ordinality as u(pid, ord)
    join public.pieces p on p.id = u.pid and p.shop_id = s.shop_id and p.status <> 'sold'
    where u.pid = any (s.piece_ids)
    order by u.pid, u.ord) x;
  if v_ids is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tray:' || s.shop_id::text, 0));
  if p_visitor is not null then
    select t.code into v_code from public.site_trays t
    where t.share_id = s.id and t.visitor_hash = p_visitor and t.created_at > now() - interval '2 hours'
      and t.piece_ids @> v_ids and t.piece_ids <@ v_ids
    order by t.created_at desc limit 1;
    if v_code is not null then
      return v_code;
    end if;
  end if;
  if (select count(*) from public.site_trays t where t.share_id = s.id and t.created_at > now() - interval '1 hour') >= 20
     or (select count(*) from public.site_trays t where t.shop_id = s.shop_id and t.created_at > now() - interval '1 hour') >= 500 then
    return null;
  end if;

  for i in 1..8 loop
    v_code := private.new_tray_code();
    begin
      insert into public.site_trays (shop_id, code, piece_ids, channel, visitor_hash, share_id)
      values (s.shop_id, v_code, v_ids, p_channel, p_visitor, s.id)
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_id := null;
    end;
  end loop;
  if v_id is null then
    return null;
  end if;
  insert into public.events (shop_id, user_id, name, props)
  values (s.shop_id, null, 'tray_created',
          jsonb_build_object('tray_id', v_id, 'channel', p_channel, 'pieces', cardinality(v_ids), 'share_id', s.id));
  return v_code;
end $$;

create or replace function public.record_share_view(p_token text, p_visitor text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  s public.shares%rowtype;
begin
  if p_token is null or char_length(p_token) <> 22 or char_length(coalesce(p_visitor, '')) > 128 then
    return false;
  end if;
  select * into s from public.shares where public_token = p_token;
  if not found or s.revoked_at is not null or s.expires_at <= now()
     or not exists (select 1 from public.shops sh where sh.id = s.shop_id and sh.status = 'active') then
    return false;
  end if;
  if s.salesperson_id = (select auth.uid()) then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('view:' || s.id::text, 0));
  if p_visitor is not null and exists (
    select 1 from public.share_views v
    where v.share_id = s.id and v.visitor_hash = p_visitor and v.viewed_at > now() - interval '30 minutes'
  ) then
    return false;
  end if;
  if (select count(*) from public.share_views v where v.share_id = s.id and v.viewed_at > now() - interval '1 hour') >= 200 then
    return false;
  end if;
  insert into public.share_views (share_id, visitor_hash) values (s.id, p_visitor);
  insert into public.events (shop_id, user_id, name, props)
    values (s.shop_id, null, 'share_viewed', jsonb_build_object('share_id', s.id));
  return true;
end $$;

-- ---------------------------------------------------------------- Takara dashboard

-- What may need a call: customer choices nobody opened for a day, AI failures, pieces whose
-- photo never arrived. Counts only.
create function private.shop_health(p_shop uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'choices_waiting', (select count(*) from public.site_trays t
                        where t.shop_id = p_shop and t.opened_at is null
                          and t.created_at < now() - interval '24 hours' and t.created_at > now() - interval '14 days'),
    'ai_errors_7d', (select count(*) from public.ai_requests a
                     where a.shop_id = p_shop and a.status in ('error', 'timeout', 'refused', 'invalid_output')
                       and a.created_at > now() - interval '7 days'),
    'no_photo', (select count(*) from public.pieces p
                 where p.shop_id = p_shop and p.status <> 'sold' and p.created_at < now() - interval '1 day'
                   and not exists (select 1 from public.piece_media m where m.piece_id = p.id and m.type = 'photo')))
$$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', (now() at time zone 'Asia/Dubai')::date)::date;
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'month', v_month,
    -- Shops are approved, paying customers: not the example shop, not ones waiting or suspended.
    'shops', (select count(*) from public.shops s where s.status = 'active' and not s.is_demo),
    'active_shops', (select count(*) from public.shops s where s.status = 'active' and not s.is_demo
                       and private.shop_last_activity(s.id) > now() - interval '7 days'),
    'pending', (select count(*) from public.shops s where s.status = 'pending' and not s.is_demo),
    'suspended', (select count(*) from public.shops s where s.status = 'suspended'),
    'published_sites', (select count(*) from public.shop_sites ss join public.shops s on s.id = ss.shop_id
                        where ss.published and s.status = 'active'),
    'current', private.shop_stats(null, private.dubai_month(v_month), private.dubai_month((v_month + interval '1 month')::date)),
    'previous', private.shop_stats(null, private.dubai_month((v_month - interval '1 month')::date), private.dubai_month(v_month)),
    'trend', (
      select jsonb_agg(jsonb_build_object(
               'month', m.d,
               'pieces_added', (select count(*) from public.pieces p
                                where p.created_at >= private.dubai_month(m.d) and p.created_at < private.dubai_month((m.d + interval '1 month')::date)),
               'trays', (select count(*) from public.site_trays t
                         where t.created_at >= private.dubai_month(m.d) and t.created_at < private.dubai_month((m.d + interval '1 month')::date)),
               'sold', (select count(*) from public.pieces p
                        where p.status = 'sold' and p.sold_at >= private.dubai_month(m.d) and p.sold_at < private.dubai_month((m.d + interval '1 month')::date)),
               'site_visitors', (select count(distinct coalesce(v.visitor_hash, v.id::text)) from public.site_views v
                                 where v.viewed_at >= private.dubai_month(m.d) and v.viewed_at < private.dubai_month((m.d + interval '1 month')::date)))
             order by m.d)
      from (select (v_month - make_interval(months => g))::date as d from generate_series(0, 11) g) m));
end $$;

-- The first owner: Takara's contact at the shop.
create function private.shop_owner(p_shop uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', pr.display_name, 'phone', pr.phone)
  from public.shop_members m join public.profiles pr on pr.user_id = m.user_id
  where m.shop_id = p_shop and m.role = 'owner'
  order by m.created_at limit 1
$$;

create or replace function public.admin_shops() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_since timestamptz := now() - interval '30 days';
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x.r order by x.last_activity desc nulls last)
    from (
      select private.shop_last_activity(s.id) as last_activity,
        jsonb_build_object(
          'id', s.id, 'name', s.name, 'created_at', s.created_at,
          'status', s.status, 'status_changed_at', s.status_changed_at, 'is_demo', s.is_demo,
          'owner', private.shop_owner(s.id),
          'last_activity', private.shop_last_activity(s.id),
          'staff', (select count(*) from public.shop_members m where m.shop_id = s.id),
          'in_stock', (select count(*) from public.pieces p where p.shop_id = s.id and p.status <> 'sold'),
          'rates_set_at', (select max(g.set_at) from public.gold_rates g where g.shop_id = s.id),
          'site', (select jsonb_build_object('slug', ss.slug, 'published', ss.published) from public.shop_sites ss where ss.shop_id = s.id),
          'health', private.shop_health(s.id),
          'last30', private.shop_stats(s.id, v_since, now())) as r
      from public.shops s) x), '[]'::jsonb);
end $$;

create or replace function public.admin_shop(p_shop uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_shop public.shops%rowtype;
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_shop from public.shops where id = p_shop;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_shop.id, 'name', v_shop.name, 'created_at', v_shop.created_at,
    'status', v_shop.status, 'status_changed_at', v_shop.status_changed_at, 'is_demo', v_shop.is_demo,
    'last_activity', private.shop_last_activity(v_shop.id),
    'staff', (select count(*) from public.shop_members m where m.shop_id = v_shop.id),
    'rates_set_at', (select max(g.set_at) from public.gold_rates g where g.shop_id = v_shop.id),
    'health', private.shop_health(v_shop.id),
    -- The shop owner is Takara's customer, so their contact details are shown.
    'owners', coalesce((
      select jsonb_agg(jsonb_build_object('name', pr.display_name, 'phone', pr.phone))
      from public.shop_members m join public.profiles pr on pr.user_id = m.user_id
      where m.shop_id = v_shop.id and m.role = 'owner'), '[]'::jsonb),
    'site', (select jsonb_build_object('slug', ss.slug, 'published', ss.published, 'price_mode', ss.price_mode)
             from public.shop_sites ss where ss.shop_id = v_shop.id),
    'report', public.shop_report(v_shop.id, null),
    'activity', coalesce((
      select jsonb_agg(a.j order by a.at desc)
      from (
        (select e.created_at as at, jsonb_build_object(
            'at', e.created_at, 'kind', e.name, 'props', e.props - 'request_id' - 'visitor',
            'piece', (select jsonb_build_object('name', p.name, 'sku', p.sku, 'sold_via', p.sold_via)
                      from public.pieces p where p.id = private.try_uuid(e.props ->> 'piece_id')),
            'tray', (select t.code from public.site_trays t where t.id = private.try_uuid(e.props ->> 'tray_id'))) as j
         from public.events e where e.shop_id = v_shop.id
         order by e.created_at desc limit 60)
        union all
        (select g.set_at, jsonb_build_object('at', g.set_at, 'kind', 'rates_set', 'props', jsonb_build_object('karats', count(*)))
         from public.gold_rates g where g.shop_id = v_shop.id
         group by g.set_at order by g.set_at desc limit 20)
      ) a), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- privileges

revoke all on function private.shop_health(uuid), private.shop_owner(uuid) from public;
grant execute on function private.shop_health(uuid), private.shop_owner(uuid) to authenticated, service_role;

revoke all on function public.my_shop_requests(), public.admin_set_shop_status(uuid, text) from public, anon;
grant execute on function public.my_shop_requests(), public.admin_set_shop_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------- schema version

create or replace function public.schema_version() returns integer
language sql immutable set search_path = '' as $$ select 2026112601 $$;
