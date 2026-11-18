-- Step 6: sharing with clients.
-- The public share page has no login. It reads through get_share(token), which returns only
-- what a client should see, and only while the link is valid. Views are recorded through
-- record_share_view(token, visitor), which ignores the salesperson's own visits and repeats.

-- AI requests now include personal messages as well as fills, counted against the same limits.
alter table public.ai_requests
  add column kind text not null default 'fill' check (kind in ('fill', 'message'));

drop function public.claim_ai_request(uuid, uuid);
create function public.claim_ai_request(p_shop uuid, p_piece uuid, p_kind text default 'fill') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_recent integer;
  v_today integer;
  v_oldest timestamptz;
begin
  if v_uid is null or not private.is_member(p_shop) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;
  if p_kind not in ('fill', 'message') then
    raise exception 'unknown kind' using errcode = '22023';
  end if;
  if p_piece is not null and exists (
    select 1 from public.pieces where id = p_piece and shop_id <> p_shop
  ) then
    raise exception 'piece belongs to another shop' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai:' || p_shop::text, 0));

  select count(*), min(created_at) into v_recent, v_oldest
    from public.ai_requests
    where user_id = v_uid and created_at > now() - interval '1 minute';
  if v_recent >= 12 then
    raise exception 'ai_rate_user'
      using errcode = 'P0001',
            hint = greatest(1, ceil(extract(epoch from (v_oldest + interval '1 minute' - now()))))::text;
  end if;

  select count(*) into v_today
    from public.ai_requests
    where shop_id = p_shop
      and created_at >= (date_trunc('day', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai');
  if v_today >= 1500 then
    raise exception 'ai_rate_shop' using errcode = 'P0001';
  end if;

  insert into public.ai_requests (shop_id, user_id, piece_id, kind)
    values (p_shop, v_uid, p_piece, p_kind)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.claim_ai_request(uuid, uuid, text) from public, anon;
grant execute on function public.claim_ai_request(uuid, uuid, text) to authenticated;

-- The share as a client sees it: shop name, current rates, VAT setting, the client's language
-- and the pieces in the order chosen. No client name, phone, salesperson or costs beyond the
-- price inputs. Expired and revoked links return only {"status":"expired","shop":...}.
create function public.get_share(p_token text) returns jsonb
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
  if s.revoked_at is not null or s.expires_at <= now() then
    return jsonb_build_object('status', 'expired', 'shop', v_shop.name);
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'shop', v_shop.name,
    'vat_enabled', v_shop.vat_enabled,
    'expires_at', s.expires_at,
    'language', coalesce((select c.language::text from public.clients c where c.id = s.client_id), 'en'),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object('karat', r.karat, 'aed_per_g', r.aed_per_g, 'set_at', r.set_at))
      from public.current_gold_rates r where r.shop_id = s.shop_id), '[]'::jsonb),
    'pieces', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'category', p.category, 'karat', p.karat,
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

-- Records that a client opened the link. Skips: invalid links, the salesperson's own visits,
-- the same visitor again within 30 minutes, and more than 200 views an hour (abuse).
create function public.record_share_view(p_token text, p_visitor text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  s public.shares%rowtype;
begin
  if p_token is null or char_length(p_token) <> 22 or char_length(coalesce(p_visitor, '')) > 128 then
    return false;
  end if;
  select * into s from public.shares where public_token = p_token;
  if not found or s.revoked_at is not null or s.expires_at <= now() then
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

revoke all on function public.get_share(text), public.record_share_view(text, text) from public;
grant execute on function public.get_share(text), public.record_share_view(text, text) to anon, authenticated;
