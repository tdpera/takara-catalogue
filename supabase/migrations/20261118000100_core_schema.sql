-- Souq Catalogue: core schema, roles and row level security.
--
-- Principles
--  * Every row that belongs to a shop carries shop_id, and every policy checks membership
--    of that shop through private.* helper functions (security definer, so policies
--    don't recurse into shop_members' own RLS).
--  * Clients, shares and share views belong to one salesperson and are invisible to
--    everyone else in the shop, owners included.
--  * Prices are never stored. They are computed from the newest gold_rates rows.
--  * Membership changes go through RPC functions that enforce the role rules, so the
--    tables themselves only grant what the app reads directly.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------- types

create type public.member_role as enum ('owner', 'manager', 'salesperson');
create type public.piece_category as enum
  ('Bangle', 'Ring', 'Chain', 'Necklace', 'Earrings', 'Pendant', 'Bracelet', 'Set', 'Other');
create type public.piece_status as enum ('in_stock', 'reserved', 'sold');
create type public.media_type as enum ('photo', 'spin_sprite', 'spin_video');
create type public.app_lang as enum ('en', 'ar', 'hi', 'ml');

-- ---------------------------------------------------------------- shared helpers

create function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- E.164 with leading +, e.g. +971501234567
create function private.is_e164(p text) returns boolean
language sql immutable as $$ select p ~ '^\+[1-9][0-9]{6,14}$' $$;

-- Parse the first folder of a storage path as a uuid without raising on bad input.
create function private.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------- shops and members

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sku_prefix text not null default 'SQ' check (sku_prefix ~ '^[A-Z0-9]{1,6}$'),
  logo_path text,
  default_making_per_g numeric(12, 4) not null default 0 check (default_making_per_g >= 0),
  vat_enabled boolean not null default true,
  currency text not null default 'AED' check (currency = 'AED'),
  next_sku integer not null default 1,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger shops_touch before update on public.shops
  for each row execute function private.touch_updated_at();

create table public.shop_members (
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index shop_members_user_idx on public.shop_members (user_id);

create table public.shop_invites (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  phone text not null check (private.is_e164(phone)),
  role public.member_role not null,
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);
create unique index shop_invites_pending_uniq on public.shop_invites (shop_id, phone)
  where accepted_at is null;
create index shop_invites_phone_idx on public.shop_invites (phone) where accepted_at is null;

-- One row per user, created automatically on sign-up.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  display_name text check (display_name is null or char_length(display_name) <= 40),
  ui_lang public.app_lang not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Membership helpers used by every policy. security definer + fixed search_path.
create function private.is_member(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop and m.user_id = (select auth.uid())
  )
$$;

create function private.has_role(p_shop uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  )
$$;

create function private.is_admin(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(p_shop, array['owner', 'manager']::public.member_role[])
$$;

-- Two users share at least one shop (lets teammates see each other's names).
create function private.shares_shop_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.shop_members a
    join public.shop_members b on b.shop_id = a.shop_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  )
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- Profile row for every new auth user.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, phone)
  values (new.id, case when new.phone is null or new.phone = '' then null
                       when left(new.phone, 1) = '+' then new.phone
                       else '+' || new.phone end)
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------- gold rates (append-only history)

create table public.gold_rates (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops (id) on delete cascade,
  karat smallint not null check (karat in (24, 22, 21, 18, 14)),
  aed_per_g numeric(12, 4) not null check (aed_per_g > 0 and aed_per_g < 100000),
  set_by uuid references auth.users (id) on delete set null default auth.uid(),
  set_at timestamptz not null default now()
);
create index gold_rates_current_idx on public.gold_rates (shop_id, karat, set_at desc, id desc);

-- Newest rate per karat. security_invoker so the caller's RLS applies.
create view public.current_gold_rates with (security_invoker = true) as
  select distinct on (shop_id, karat) shop_id, karat, aed_per_g, set_by, set_at
  from public.gold_rates
  order by shop_id, karat, set_at desc, id desc;

-- ---------------------------------------------------------------- pieces and media

create table public.pieces (
  -- The phone generates the id so a piece can be captured offline and synced later.
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  sku text not null default '',
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category public.piece_category not null,
  karat smallint not null check (karat in (24, 22, 21, 18, 14)),
  gross_g numeric(10, 3) not null check (gross_g > 0 and gross_g < 100000),
  stone_g numeric(10, 3) not null default 0 check (stone_g >= 0),
  making_per_g numeric(12, 4) not null default 0 check (making_per_g >= 0),
  making_flat numeric(12, 2) check (making_flat is null or making_flat >= 0),
  extras_aed numeric(12, 2) not null default 0 check (extras_aed >= 0),
  descriptions jsonb not null default '{}'::jsonb check (jsonb_typeof(descriptions) = 'object'),
  status public.piece_status not null default 'in_stock',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pieces_stone_lt_gross check (stone_g < gross_g),
  constraint pieces_shop_sku_uniq unique (shop_id, sku),
  constraint pieces_id_shop_uniq unique (id, shop_id)
);
create index pieces_shop_created_idx on public.pieces (shop_id, created_at desc);

-- Assign an immutable per-shop SKU (e.g. AFJ-0042) and stop shop/sku/creator changes.
create function private.pieces_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_seq integer;
  v_prefix text;
begin
  if tg_op = 'INSERT' then
    update public.shops set next_sku = next_sku + 1
      where id = new.shop_id
      returning next_sku - 1, sku_prefix into v_seq, v_prefix;
    new.sku := v_prefix || '-' || lpad(v_seq::text, 4, '0');
  else
    if new.shop_id is distinct from old.shop_id
       or new.sku is distinct from old.sku
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'shop_id, sku, created_by and created_at cannot be changed'
        using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger pieces_before_write before insert or update on public.pieces
  for each row execute function private.pieces_before_write();

create function private.can_edit_piece(p_piece uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pieces p
    where p.id = p_piece
      and private.is_member(p.shop_id)
      and (p.created_by = (select auth.uid()) or private.is_admin(p.shop_id))
  )
$$;
revoke all on function private.can_edit_piece(uuid) from public;
grant execute on function private.can_edit_piece(uuid) to authenticated, service_role;

create table public.piece_media (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null,
  shop_id uuid not null,
  type public.media_type not null,
  storage_path text not null,
  thumb_path text,
  frames smallint check (frames is null or frames between 1 and 120),
  cols smallint check (cols is null or cols between 1 and 24),
  cell_px smallint check (cell_px is null or cell_px between 32 and 2048),
  bytes bigint check (bytes is null or bytes >= 0),
  sort_order smallint not null default 0,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (piece_id, shop_id) references public.pieces (id, shop_id) on delete cascade,
  constraint piece_media_path_in_shop check (storage_path like shop_id::text || '/%'),
  constraint piece_media_sprite_fields check (
    type <> 'spin_sprite' or (frames is not null and cols is not null and cell_px is not null))
);
create index piece_media_piece_idx on public.piece_media (piece_id, sort_order);

-- ---------------------------------------------------------------- clients and shares (private per salesperson)

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  salesperson_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  phone text check (phone is null or private.is_e164(phone)),
  language public.app_lang not null default 'en',
  preferences text check (preferences is null or char_length(preferences) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_owner_idx on public.clients (salesperson_id, shop_id);
create trigger clients_touch before update on public.clients
  for each row execute function private.touch_updated_at();

create function private.new_share_token() returns text
language sql volatile as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=')
$$;

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  salesperson_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  client_id uuid references public.clients (id) on delete set null,
  piece_ids uuid[] not null check (cardinality(piece_ids) between 1 and 24),
  message text check (message is null or char_length(message) <= 4000),
  public_token text not null unique default private.new_share_token(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index shares_owner_idx on public.shares (salesperson_id, created_at desc);

-- Shares may only reference the salesperson's own client and pieces from the same shop.
create function private.shares_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.shop_id is distinct from old.shop_id
      or new.salesperson_id is distinct from old.salesperson_id
      or new.public_token is distinct from old.public_token
      or new.piece_ids is distinct from old.piece_ids) then
    raise exception 'only message, client, expiry and revocation can change' using errcode = '42501';
  end if;
  if new.client_id is not null and not exists (
      select 1 from public.clients c
      where c.id = new.client_id and c.salesperson_id = new.salesperson_id and c.shop_id = new.shop_id) then
    raise exception 'client does not belong to this salesperson' using errcode = '42501';
  end if;
  if exists (
      select 1 from unnest(new.piece_ids) as pid
      where not exists (select 1 from public.pieces p where p.id = pid and p.shop_id = new.shop_id)) then
    raise exception 'every piece must belong to the share''s shop' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger shares_before_write before insert or update on public.shares
  for each row execute function private.shares_before_write();

-- Written only by the server (service role) when a share link is opened.
create table public.share_views (
  id bigint generated always as identity primary key,
  share_id uuid not null references public.shares (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  visitor_hash text check (visitor_hash is null or char_length(visitor_hash) <= 128)
);
create index share_views_share_idx on public.share_views (share_id, viewed_at desc);

-- ---------------------------------------------------------------- analytics events

create table public.events (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  name text not null check (name in ('piece_added', 'ai_fill_used', 'share_created', 'share_viewed')),
  props jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 4096),
  created_at timestamptz not null default now()
);
create index events_shop_name_idx on public.events (shop_id, name, created_at desc);

-- ---------------------------------------------------------------- privileges

-- Start from nothing for API roles, then grant only what the app uses.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.shops to authenticated;
grant update (name, sku_prefix, logo_path, default_making_per_g, vat_enabled) on public.shops to authenticated;
grant select on public.shop_members, public.shop_invites to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, ui_lang) on public.profiles to authenticated;
grant select, insert on public.gold_rates to authenticated;
grant select on public.current_gold_rates to authenticated;
grant select, insert, delete on public.pieces to authenticated;
grant update (name, category, karat, gross_g, stone_g, making_per_g, making_flat, extras_aed, descriptions, status)
  on public.pieces to authenticated;
grant select, insert, delete on public.piece_media to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert on public.shares to authenticated;
grant update (message, client_id, expires_at, revoked_at) on public.shares to authenticated;
grant select on public.share_views to authenticated;
grant select, insert on public.events to authenticated;

-- ---------------------------------------------------------------- row level security

alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.shop_invites enable row level security;
alter table public.profiles enable row level security;
alter table public.gold_rates enable row level security;
alter table public.pieces enable row level security;
alter table public.piece_media enable row level security;
alter table public.clients enable row level security;
alter table public.shares enable row level security;
alter table public.share_views enable row level security;
alter table public.events enable row level security;

create policy shops_select on public.shops for select to authenticated
  using (private.is_member(id));
create policy shops_update on public.shops for update to authenticated
  using (private.is_admin(id)) with check (private.is_admin(id));

create policy members_select on public.shop_members for select to authenticated
  using (private.is_member(shop_id));

create policy invites_select on public.shop_invites for select to authenticated
  using (private.is_admin(shop_id));

create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or private.shares_shop_with(user_id));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy rates_select on public.gold_rates for select to authenticated
  using (private.is_member(shop_id));
create policy rates_insert on public.gold_rates for insert to authenticated
  with check (private.is_admin(shop_id) and set_by = (select auth.uid()));

create policy pieces_select on public.pieces for select to authenticated
  using (private.is_member(shop_id));
create policy pieces_insert on public.pieces for insert to authenticated
  with check (private.is_member(shop_id) and created_by = (select auth.uid()));
create policy pieces_update on public.pieces for update to authenticated
  using (private.is_member(shop_id) and (created_by = (select auth.uid()) or private.is_admin(shop_id)))
  with check (private.is_member(shop_id));
create policy pieces_delete on public.pieces for delete to authenticated
  using (private.is_admin(shop_id));

create policy media_select on public.piece_media for select to authenticated
  using (private.is_member(shop_id));
create policy media_insert on public.piece_media for insert to authenticated
  with check (private.can_edit_piece(piece_id) and created_by = (select auth.uid()));
create policy media_delete on public.piece_media for delete to authenticated
  using (private.can_edit_piece(piece_id));

create policy clients_all on public.clients for all to authenticated
  using (salesperson_id = (select auth.uid()) and private.is_member(shop_id))
  with check (salesperson_id = (select auth.uid()) and private.is_member(shop_id));

create policy shares_select on public.shares for select to authenticated
  using (salesperson_id = (select auth.uid()) and private.is_member(shop_id));
create policy shares_insert on public.shares for insert to authenticated
  with check (salesperson_id = (select auth.uid()) and private.is_member(shop_id));
create policy shares_update on public.shares for update to authenticated
  using (salesperson_id = (select auth.uid()) and private.is_member(shop_id))
  with check (salesperson_id = (select auth.uid()) and private.is_member(shop_id));

create policy share_views_select on public.share_views for select to authenticated
  using (exists (select 1 from public.shares s
                 where s.id = share_id and s.salesperson_id = (select auth.uid())));

-- share_viewed is recorded by the server; the app may log the other three.
create policy events_insert on public.events for insert to authenticated
  with check (private.is_member(shop_id) and user_id = (select auth.uid()) and name <> 'share_viewed');
create policy events_select on public.events for select to authenticated
  using (private.is_admin(shop_id));

-- ---------------------------------------------------------------- membership RPCs

-- Any signed-in user can create a shop and becomes its owner.
create function public.create_shop(p_name text, p_sku_prefix text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_shop uuid;
  v_prefix text;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  v_prefix := upper(coalesce(nullif(btrim(p_sku_prefix), ''),
    left(regexp_replace(upper(p_name), '[^A-Z0-9]', '', 'g'), 3)));
  if v_prefix = '' then v_prefix := 'SQ'; end if;
  insert into public.shops (name, sku_prefix, created_by) values (btrim(p_name), v_prefix, v_uid)
    returning id into v_shop;
  insert into public.shop_members (shop_id, user_id, role) values (v_shop, v_uid, 'owner');
  return v_shop;
end $$;

-- Owners invite anyone; managers invite salespeople only.
create function public.invite_member(p_shop uuid, p_phone text, p_role public.member_role)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_user uuid;
begin
  if not private.is_admin(p_shop) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_role <> 'salesperson' and not private.has_role(p_shop, array['owner']::public.member_role[]) then
    raise exception 'only an owner can invite owners or managers' using errcode = '42501';
  end if;
  if not private.is_e164(p_phone) then raise exception 'phone must be in +971... format' using errcode = '22023'; end if;

  -- Already a member? Nothing to do.
  select p.user_id into v_user from public.profiles p where p.phone = p_phone;
  if v_user is not null and exists (select 1 from public.shop_members m where m.shop_id = p_shop and m.user_id = v_user) then
    raise exception 'this number is already in the shop' using errcode = '23505';
  end if;

  insert into public.shop_invites (shop_id, phone, role, invited_by)
    values (p_shop, p_phone, p_role, auth.uid())
    on conflict (shop_id, phone) where accepted_at is null
    do update set role = excluded.role, invited_by = excluded.invited_by, created_at = now()
    returning id into v_id;
  return v_id;
end $$;

-- Called after sign-in: joins every shop that invited this phone number.
create function public.accept_invites() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_count integer;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select case when u.phone is null or u.phone = '' then null
              when left(u.phone, 1) = '+' then u.phone else '+' || u.phone end
    into v_phone
    from auth.users u where u.id = v_uid and u.phone_confirmed_at is not null;
  if v_phone is null then return 0; end if;

  with pending as (
    update public.shop_invites i set accepted_at = now(), accepted_by = v_uid
    where i.phone = v_phone and i.accepted_at is null
    returning i.shop_id, i.role
  ), joined as (
    insert into public.shop_members (shop_id, user_id, role)
    select shop_id, v_uid, role from pending
    on conflict (shop_id, user_id) do nothing
    returning 1
  )
  select count(*) into v_count from joined;
  return v_count;
end $$;

create function public.cancel_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_shop uuid; v_role public.member_role;
begin
  select shop_id, role into v_shop, v_role from public.shop_invites where id = p_invite and accepted_at is null;
  if v_shop is null or not private.is_admin(v_shop)
     or (v_role <> 'salesperson' and not private.has_role(v_shop, array['owner']::public.member_role[])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.shop_invites where id = p_invite;
end $$;

-- Owners change any role; a shop always keeps at least one owner.
create function public.set_member_role(p_shop uuid, p_user uuid, p_role public.member_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(p_shop, array['owner']::public.member_role[]) then
    raise exception 'only an owner can change roles' using errcode = '42501';
  end if;
  perform 1 from public.shop_members where shop_id = p_shop for update;
  update public.shop_members set role = p_role where shop_id = p_shop and user_id = p_user;
  if not found then raise exception 'not a member' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.shop_members where shop_id = p_shop and role = 'owner') then
    raise exception 'a shop needs at least one owner' using errcode = '23514';
  end if;
end $$;

-- Owners remove anyone, managers remove salespeople, anyone can leave.
create function public.remove_member(p_shop uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_target public.member_role;
begin
  perform 1 from public.shop_members where shop_id = p_shop for update;
  select role into v_target from public.shop_members where shop_id = p_shop and user_id = p_user;
  if v_target is null then raise exception 'not a member' using errcode = 'P0002'; end if;
  if not (p_user = auth.uid()
          or private.has_role(p_shop, array['owner']::public.member_role[])
          or (v_target = 'salesperson' and private.is_admin(p_shop))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.shop_members where shop_id = p_shop and user_id = p_user;
  if not exists (select 1 from public.shop_members where shop_id = p_shop and role = 'owner') then
    raise exception 'a shop needs at least one owner' using errcode = '23514';
  end if;
end $$;

-- Any member can mark a piece in stock, reserved or sold.
create function public.set_piece_status(p_piece uuid, p_status public.piece_status)
returns void language plpgsql security definer set search_path = '' as $$
declare v_shop uuid;
begin
  select shop_id into v_shop from public.pieces where id = p_piece;
  if v_shop is null or not private.is_member(v_shop) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.pieces set status = p_status where id = p_piece;
end $$;

revoke all on function public.create_shop(text, text), public.invite_member(uuid, text, public.member_role),
  public.accept_invites(), public.cancel_invite(uuid), public.set_member_role(uuid, uuid, public.member_role),
  public.remove_member(uuid, uuid), public.set_piece_status(uuid, public.piece_status) from public, anon;
grant execute on function public.create_shop(text, text), public.invite_member(uuid, text, public.member_role),
  public.accept_invites(), public.cancel_invite(uuid), public.set_member_role(uuid, uuid, public.member_role),
  public.remove_member(uuid, uuid), public.set_piece_status(uuid, public.piece_status) to authenticated;

-- ---------------------------------------------------------------- storage

-- media: {shop_id}/{piece_id}/{file}. Private; the share page uses signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', false, 104857600,
   array['image/jpeg', 'image/webp', 'image/png', 'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp']),
  ('branding', 'branding', false, 2097152, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and private.is_member(private.try_uuid((storage.foldername(name))[1])));
create policy media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and private.is_member(private.try_uuid((storage.foldername(name))[1])));
create policy media_remove on storage.objects for delete to authenticated
  using (bucket_id = 'media' and private.is_admin(private.try_uuid((storage.foldername(name))[1])));

create policy branding_read on storage.objects for select to authenticated
  using (bucket_id = 'branding' and private.is_member(private.try_uuid((storage.foldername(name))[1])));
create policy branding_write on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and private.is_admin(private.try_uuid((storage.foldername(name))[1])));
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and private.is_admin(private.try_uuid((storage.foldername(name))[1])));
create policy branding_remove on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and private.is_admin(private.try_uuid((storage.foldername(name))[1])));
