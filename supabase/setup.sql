-- Takara: full database setup for a NEW, empty Supabase project.
-- Generated from supabase/migrations by `pnpm db:setup-sql`; don't edit by hand.
--
-- How to use: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- Run it once only. It is all-or-nothing: if anything fails, nothing is changed.
-- For later changes, prefer `supabase db push` (see README, "Deploy").
-- Migrations included: 20261118000100_core_schema.sql, 20261118000200_ai_fill.sql, 20261118000300_sharing.sql, 20261124000100_websites_trays_reports.sql, 20261125000100_digital_trays_showcase.sql, 20261126000100_shop_approval.sql

begin;

-- ============================================================ 20261118000100_core_schema.sql

-- Takara: core schema, roles and row level security.
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

-- ============================================================ 20261118000200_ai_fill.sql

-- Step 4: AI fill from photo.
-- Every call to Claude is recorded here first (claim), then completed (finish). The claim is
-- where rate limits are enforced, atomically per shop. Rows are written only through the two
-- functions below; members can read their own shop's rows (usage and cost reporting).

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  -- The phone's id for the piece being captured. The piece row may not exist yet.
  piece_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'ok', 'unreadable', 'refused', 'invalid_output', 'busy', 'timeout', 'error')),
  model text check (char_length(model) <= 100),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  duration_ms integer check (duration_ms >= 0),
  -- The validated suggestions (never the raw model output).
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ai_requests_shop_created_idx on public.ai_requests (shop_id, created_at desc);
create index ai_requests_user_created_idx on public.ai_requests (user_id, created_at desc);
create index ai_requests_piece_idx on public.ai_requests (piece_id, finished_at desc) where status = 'ok';

alter table public.ai_requests enable row level security;
revoke all on public.ai_requests from anon, authenticated;
grant select on public.ai_requests to authenticated;
create policy ai_requests_select on public.ai_requests for select to authenticated
  using (private.is_member(shop_id));

-- Limits: 12 requests a minute per person (a fast capture is one piece every ~8 s) and
-- 1500 a day per shop (about USD 15-30 at current prices). The day is the Dubai day.
create function public.claim_ai_request(p_shop uuid, p_piece uuid) returns uuid
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
  if p_piece is not null and exists (
    select 1 from public.pieces where id = p_piece and shop_id <> p_shop
  ) then
    raise exception 'piece belongs to another shop' using errcode = '42501';
  end if;

  -- Serialise claims per shop so two phones can't both slip under a limit.
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

  insert into public.ai_requests (shop_id, user_id, piece_id)
    values (p_shop, v_uid, p_piece)
    returning id into v_id;
  return v_id;
end $$;

-- Records the outcome. When it succeeded and the piece was already saved without
-- descriptions, the descriptions are added to it (the salesperson may save before the AI
-- replies). The advisory lock on the piece id pairs with pieces_copy_ai_descriptions below,
-- so whichever runs second sees the other's committed row.
create function public.finish_ai_request(
  p_id uuid, p_status text, p_model text, p_input_tokens integer, p_output_tokens integer,
  p_duration_ms integer, p_result jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  r public.ai_requests%rowtype;
begin
  update public.ai_requests
    set status = p_status, model = p_model, input_tokens = p_input_tokens,
        output_tokens = p_output_tokens, duration_ms = p_duration_ms,
        result = case when p_status = 'ok' then p_result end, finished_at = now()
    where id = p_id and user_id = v_uid and status = 'pending'
    returning * into r;
  if not found then
    raise exception 'unknown or finished request' using errcode = '42501';
  end if;

  if r.status = 'ok' and r.piece_id is not null
     and jsonb_typeof(r.result -> 'descriptions') = 'object'
     and r.result -> 'descriptions' <> '{}'::jsonb then
    perform pg_advisory_xact_lock(hashtextextended('piece:' || r.piece_id::text, 0));
    update public.pieces p
      set descriptions = r.result -> 'descriptions'
      where p.id = r.piece_id
        and p.shop_id = r.shop_id
        and p.descriptions = '{}'::jsonb
        and (p.created_by = v_uid or private.is_admin(p.shop_id));
  end if;
end $$;

-- A piece saved without descriptions takes them from the AI reply for that piece, if one
-- already arrived.
create function private.pieces_copy_ai_descriptions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.descriptions = '{}'::jsonb then
    perform pg_advisory_xact_lock(hashtextextended('piece:' || new.id::text, 0));
    select a.result -> 'descriptions' into new.descriptions
      from public.ai_requests a
      where a.piece_id = new.id
        and a.shop_id = new.shop_id
        and a.user_id = new.created_by
        and a.status = 'ok'
        and jsonb_typeof(a.result -> 'descriptions') = 'object'
      order by a.finished_at desc
      limit 1;
    new.descriptions := coalesce(new.descriptions, '{}'::jsonb);
  end if;
  return new;
end $$;
create trigger pieces_copy_ai_descriptions before insert on public.pieces
  for each row execute function private.pieces_copy_ai_descriptions();

revoke all on function public.claim_ai_request(uuid, uuid) from public, anon;
revoke all on function public.finish_ai_request(uuid, text, text, integer, integer, integer, jsonb) from public, anon;
revoke all on function private.pieces_copy_ai_descriptions() from public;
grant execute on function public.claim_ai_request(uuid, uuid) to authenticated;
grant execute on function public.finish_ai_request(uuid, text, text, integer, integer, integer, jsonb) to authenticated;

-- ============================================================ 20261118000300_sharing.sql

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

-- ============================================================ 20261124000100_websites_trays_reports.sql

-- Shop websites, trays, sold attribution, monthly reports and the Takara dashboard.
--
-- - Each shop can publish a website: a customer-facing, read-only copy of its catalogue.
--   No buying, paying or reserving online; the website is a shop window.
-- - Customers collect pieces in a tray and either send it to the shop on WhatsApp or show its
--   code in the shop. Staff open the tray in the app.
-- - When a piece is sold, staff can record how the customer found it (walk-in, website, tray...).
-- - Owners see a monthly report; Takara's own admins see every shop in one dashboard.
--
-- Website reads go through functions only the server (service role) may call: they return
-- making charges so the server can work out prices, and making charges must never be public.

-- ---------------------------------------------------------------- shop websites

create type public.price_mode as enum ('live', 'from', 'ask');

create table public.shop_sites (
  shop_id uuid primary key references public.shops (id) on delete cascade,
  -- <slug>.<takara domain>. Lowercase letters, digits and hyphens, 3-40 characters.
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
           and slug not in ('app', 'www', 'admin', 'api', 'mail', 'static', 'assets', 'cdn', 'help', 'support',
                            'status', 'blog', 'login', 'site', 'takara', 'dashboard', 'shop', 'shops', 'files')),
  published boolean not null default false,
  -- live: today's price; from: the gold value only ("From AED ..."); ask: no prices.
  price_mode public.price_mode not null default 'live',
  whatsapp text check (whatsapp is null or private.is_e164(whatsapp)),
  address text check (address is null or char_length(address) <= 200),
  maps_url text check (maps_url is null or (char_length(maps_url) <= 500 and maps_url ~ '^https://')),
  hours text check (hours is null or char_length(hours) <= 200),
  instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  -- A short introduction per language: {"en": "...", "ar": "..."}.
  about jsonb not null default '{}'::jsonb
    check (jsonb_typeof(about) = 'object' and pg_column_size(about) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger shop_sites_touch before update on public.shop_sites
  for each row execute function private.touch_updated_at();

alter table public.shop_sites enable row level security;
grant select, insert on public.shop_sites to authenticated;
grant update (slug, published, price_mode, whatsapp, address, maps_url, hours, instagram, about)
  on public.shop_sites to authenticated;
create policy shop_sites_select on public.shop_sites for select to authenticated
  using (private.is_member(shop_id));
create policy shop_sites_insert on public.shop_sites for insert to authenticated
  with check (private.is_admin(shop_id));
create policy shop_sites_update on public.shop_sites for update to authenticated
  using (private.is_admin(shop_id)) with check (private.is_admin(shop_id));

-- ---------------------------------------------------------------- pieces: website and sales

alter table public.pieces
  add column on_website boolean not null default true,
  add column sold_via text
    check (sold_via in ('walk_in', 'website', 'tray', 'whatsapp_link', 'returning_client')),
  add column sold_at timestamptz,
  -- The price when it was sold (today's price at that moment), for reports.
  add column sold_value_aed numeric(14, 2) check (sold_value_aed is null or sold_value_aed >= 0);
create index pieces_sold_idx on public.pieces (shop_id, sold_at) where status = 'sold';

-- Selling stamps the time; un-selling clears how and when.
create function private.pieces_sold_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'sold' then
    if tg_op = 'INSERT' or old.status is distinct from 'sold' or new.sold_at is null then
      new.sold_at := coalesce(new.sold_at, now());
    end if;
  else
    new.sold_at := null;
    new.sold_via := null;
    new.sold_value_aed := null;
  end if;
  return new;
end $$;
create trigger pieces_sold_fields before insert or update of status on public.pieces
  for each row execute function private.pieces_sold_fields();

-- ---------------------------------------------------------------- events

alter table public.events drop constraint events_name_check;
alter table public.events add constraint events_name_check
  check (name in ('piece_added', 'ai_fill_used', 'share_created', 'share_viewed',
                  'piece_sold', 'tray_created', 'tray_opened'));
-- The app may log only its own three; the rest are recorded by database functions.
drop policy events_insert on public.events;
create policy events_insert on public.events for insert to authenticated
  with check (private.is_member(shop_id) and user_id = (select auth.uid())
              and name in ('piece_added', 'ai_fill_used', 'share_created'));

-- Any member can mark a piece in stock, reserved or sold. Selling can say how the customer
-- found it and what it sold for (today's price, worked out by the server).
drop function public.set_piece_status(uuid, public.piece_status);
create function public.set_piece_status(
  p_piece uuid,
  p_status public.piece_status,
  p_sold_via text default null,
  p_sold_value numeric default null,
  p_tray uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_shop uuid;
  v_before public.piece_status;
begin
  select shop_id, status into v_shop, v_before from public.pieces where id = p_piece;
  if v_shop is null or not private.is_member(v_shop) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_tray is not null and not exists (
    select 1 from public.site_trays t where t.id = p_tray and t.shop_id = v_shop and p_piece = any (t.piece_ids)
  ) then
    raise exception 'tray does not hold this piece' using errcode = '22023';
  end if;
  if p_status = 'sold' then
    update public.pieces
       set status = 'sold',
           sold_via = coalesce(p_sold_via, case when p_tray is not null then 'tray' end, sold_via),
           sold_value_aed = coalesce(round(p_sold_value, 2), sold_value_aed)
     where id = p_piece;
    if v_before is distinct from 'sold' then
      insert into public.events (shop_id, user_id, name, props)
      values (v_shop, (select auth.uid()), 'piece_sold',
              jsonb_strip_nulls(jsonb_build_object('piece_id', p_piece, 'tray_id', p_tray)));
    end if;
  else
    update public.pieces set status = p_status where id = p_piece;
  end if;
end $$;

-- "How did they find it?", answered (or corrected) after marking sold.
create function public.set_sold_via(p_piece uuid, p_via text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_shop uuid;
begin
  select shop_id into v_shop from public.pieces where id = p_piece and status = 'sold';
  if v_shop is null or not private.is_member(v_shop) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.pieces set sold_via = p_via where id = p_piece;
end $$;

-- Owners and managers choose which pieces appear on the website (one or many at once).
create function public.set_on_website(p_shop uuid, p_pieces uuid[], p_on boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not private.is_admin(p_shop) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_pieces is null or cardinality(p_pieces) > 500 then
    raise exception 'too many pieces' using errcode = '22023';
  end if;
  update public.pieces set on_website = p_on where shop_id = p_shop and id = any (p_pieces);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------- trays

create table public.site_trays (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  -- 6 characters with no look-alikes (no 0/O, 1/I/L).
  code text not null check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  piece_ids uuid[] not null check (cardinality(piece_ids) between 1 and 24),
  -- How the customer first used it: sent on WhatsApp, or shown in the shop.
  channel text not null check (channel in ('whatsapp', 'in_store')),
  visitor_hash text check (visitor_hash is null or char_length(visitor_hash) <= 128),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  opened_by uuid references auth.users (id) on delete set null,
  unique (shop_id, code)
);
create index site_trays_shop_created_idx on public.site_trays (shop_id, created_at desc);

alter table public.site_trays enable row level security;
grant select on public.site_trays to authenticated;
create policy site_trays_select on public.site_trays for select to authenticated
  using (private.is_member(shop_id));

create function private.new_tray_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b.bytes, i) % 31), 1), '' order by i)
  from (select extensions.gen_random_bytes(6) as bytes) b, generate_series(0, 5) as i
$$;

-- Staff open a tray by its code (typed, scanned or from a WhatsApp message). The first open is
-- recorded, so the shop can see which trays turned into visits.
create function public.open_tray(p_shop uuid, p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  t public.site_trays%rowtype;
begin
  if not private.is_member(p_shop) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into t from public.site_trays where shop_id = p_shop and code = v_code;
  if not found then
    return null;
  end if;
  if t.opened_at is null then
    update public.site_trays set opened_at = now(), opened_by = (select auth.uid()) where id = t.id;
    insert into public.events (shop_id, user_id, name, props)
    values (p_shop, (select auth.uid()), 'tray_opened', jsonb_build_object('tray_id', t.id));
  end if;
  return t.id;
end $$;

-- ---------------------------------------------------------------- website reads (server only)

create table public.site_views (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops (id) on delete cascade,
  piece_id uuid references public.pieces (id) on delete cascade,
  visitor_hash text check (visitor_hash is null or char_length(visitor_hash) <= 128),
  viewed_at timestamptz not null default now()
);
create index site_views_shop_time_idx on public.site_views (shop_id, viewed_at desc);
create index site_views_piece_idx on public.site_views (piece_id, viewed_at desc) where piece_id is not null;
alter table public.site_views enable row level security;

-- Pieces a website shows: chosen for the website, and not sold more than 7 days ago.
create function private.site_visible(p_shop uuid) returns setof public.pieces
language sql stable security definer set search_path = '' as $$
  select * from public.pieces p
  where p.shop_id = p_shop and p.on_website
    and (p.status <> 'sold' or p.sold_at > now() - interval '7 days')
$$;

create function private.site_shop(p_slug text) returns uuid
language sql stable security definer set search_path = '' as $$
  select shop_id from public.shop_sites where slug = lower(p_slug) and published
$$;

-- One piece as the server needs it to show it (making charges included, for working out the
-- price; never sent to the browser).
create function private.site_piece_json(p_piece uuid, p_full boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'sku', p.sku, 'name', p.name, 'category', p.category, 'karat', p.karat,
    'gross_g', p.gross_g, 'stone_g', p.stone_g, 'making_per_g', p.making_per_g,
    'making_flat', p.making_flat, 'extras_aed', p.extras_aed, 'status', p.status,
    'created_at', p.created_at, 'updated_at', p.updated_at,
    'descriptions', case when p_full then p.descriptions end,
    'photo', (select jsonb_build_object('path', m.storage_path, 'thumb', m.thumb_path)
              from public.piece_media m where m.piece_id = p.id and m.type = 'photo'
              order by m.created_at limit 1),
    'spin', (select jsonb_build_object('path', m.storage_path, 'small', m.thumb_path, 'frames', m.frames, 'cols', m.cols)
             from public.piece_media m
             where m.piece_id = p.id and m.type = 'spin_sprite' and m.frames is not null and m.cols is not null
             order by m.created_at limit 1))
  from public.pieces p where p.id = p_piece
$$;

create function private.site_rates(p_shop uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('karat', r.karat, 'aed_per_g', r.aed_per_g, 'set_at', r.set_at)), '[]'::jsonb)
  from public.current_gold_rates r where r.shop_id = p_shop
$$;

-- The website's shop details, today's rates and how many pieces each category has.
create function public.get_site(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.shop_sites%rowtype;
  v_shop public.shops%rowtype;
begin
  select * into s from public.shop_sites where slug = lower(p_slug) and published;
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

-- One page of the website's catalogue, filtered and sorted. Sold pieces come last.
create function public.list_site_pieces(
  p_slug text,
  p_category text default null,
  p_karat integer default null,
  p_wmin numeric default null,
  p_wmax numeric default null,
  p_q text default null,
  p_sort text default 'newest',
  p_limit integer default 24,
  p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_shop uuid := private.site_shop(p_slug);
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_out jsonb;
begin
  if v_shop is null then
    return null;
  end if;
  if v_q is not null then
    v_q := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with f as (
    select p.id, p.status, p.gross_g, p.created_at
    from private.site_visible(v_shop) p
    where (p_category is null or p.category::text = p_category)
      and (p_karat is null or p.karat = p_karat)
      and (p_wmin is null or p.gross_g >= p_wmin)
      and (p_wmax is null or p.gross_g < p_wmax)
      and (v_q is null or p.name ilike v_q or p.sku ilike v_q)
  ), pg as (
    select f.id, row_number() over (
             order by (f.status = 'sold'),
                      case when p_sort = 'weight_desc' then -f.gross_g when p_sort = 'weight_asc' then f.gross_g end nulls last,
                      f.created_at desc, f.id desc) as ord
    from f
    order by ord
    limit least(greatest(coalesce(p_limit, 24), 1), 480) offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'pieces', coalesce((select jsonb_agg(private.site_piece_json(pg.id, false) order by pg.ord) from pg), '[]'::jsonb))
  into v_out;
  return v_out;
end $$;

-- One piece by its code, with a few others from the same category.
create function public.get_site_piece(p_slug text, p_sku text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_shop uuid := private.site_shop(p_slug);
  v_piece public.pieces%rowtype;
begin
  if v_shop is null then
    return null;
  end if;
  select * into v_piece from private.site_visible(v_shop) p where p.sku = p_sku;
  if not found then
    return null;
  end if;
  return private.site_piece_json(v_piece.id, true) || jsonb_build_object(
    'related', coalesce((
      select jsonb_agg(private.site_piece_json(r.id, false) order by r.created_at desc)
      from (select p.id, p.created_at from private.site_visible(v_shop) p
            where p.category = v_piece.category and p.id <> v_piece.id and p.status <> 'sold'
            order by p.created_at desc limit 4) r), '[]'::jsonb));
end $$;

-- Pieces by id, in the order given (the visitor's tray before it becomes a code).
create function public.site_pieces(p_slug text, p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.site_piece_json(p.id, false) order by u.ord), '[]'::jsonb)
  from unnest(p_ids[1:24]) with ordinality as u(pid, ord)
  join private.site_visible(private.site_shop(p_slug)) p on p.id = u.pid
$$;

-- Every piece's code and last change, for the sitemap.
create function public.site_sitemap(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('sku', p.sku, 'updated_at', p.updated_at) order by p.created_at desc), '[]'::jsonb)
  from (select * from private.site_visible(private.site_shop(p_slug)) p where p.status <> 'sold' limit 5000) p
$$;

-- Which bucket a website image may be read from: 'media' for photos and spins of pieces the
-- website shows (or showed in the last 30 days, for trays), 'branding' for the shop's logo.
create function public.site_media_bucket(p_slug text, p_path text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (
      select 1 from public.piece_media m
      join public.pieces p on p.id = m.piece_id
      where m.shop_id = private.site_shop(p_slug) and p.on_website
        and (p.status <> 'sold' or p.sold_at > now() - interval '30 days')
        and m.type in ('photo', 'spin_sprite') and (m.storage_path = p_path or m.thumb_path = p_path))
      then 'media'
    when exists (
      select 1 from public.shops s where s.id = private.site_shop(p_slug) and s.logo_path = p_path)
      then 'branding'
  end
$$;

-- A customer turns their tray into a code: to send on WhatsApp or show in the shop. Keeps their
-- order, drops duplicates and pieces that are sold or hidden. The same customer sending the
-- same tray again within 2 hours gets the same code. Returns null if nothing could be saved.
create function public.create_tray(p_slug text, p_piece_ids uuid[], p_channel text, p_visitor text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_shop uuid := private.site_shop(p_slug);
  v_ids uuid[];
  v_code text;
  v_id uuid;
begin
  if v_shop is null or p_channel not in ('whatsapp', 'in_store') or p_piece_ids is null
     or cardinality(p_piece_ids) not between 1 and 24 or char_length(coalesce(p_visitor, '')) > 128 then
    return null;
  end if;
  select array_agg(x.pid order by x.ord) into v_ids
  from (
    select distinct on (u.pid) u.pid, u.ord
    from unnest(p_piece_ids) with ordinality as u(pid, ord)
    join public.pieces p on p.id = u.pid and p.shop_id = v_shop and p.on_website and p.status <> 'sold'
    order by u.pid, u.ord) x;
  if v_ids is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tray:' || v_shop::text, 0));
  if p_visitor is not null then
    select t.code into v_code from public.site_trays t
    where t.shop_id = v_shop and t.visitor_hash = p_visitor and t.created_at > now() - interval '2 hours'
      and t.piece_ids @> v_ids and t.piece_ids <@ v_ids
    order by t.created_at desc limit 1;
    if v_code is not null then
      return v_code;
    end if;
    if (select count(*) from public.site_trays t
        where t.shop_id = v_shop and t.visitor_hash = p_visitor and t.created_at > now() - interval '1 hour') >= 20 then
      return null;
    end if;
  end if;
  if (select count(*) from public.site_trays t where t.shop_id = v_shop and t.created_at > now() - interval '1 hour') >= 500 then
    return null;
  end if;

  for i in 1..8 loop
    v_code := private.new_tray_code();
    begin
      insert into public.site_trays (shop_id, code, piece_ids, channel, visitor_hash)
      values (v_shop, v_code, v_ids, p_channel, p_visitor)
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
  values (v_shop, null, 'tray_created', jsonb_build_object('tray_id', v_id, 'channel', p_channel, 'pieces', cardinality(v_ids)));
  return v_code;
end $$;

-- A tray as the customer sees it (its public page), for 60 days.
create function public.get_tray(p_slug text, p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_shop uuid := private.site_shop(p_slug);
  t public.site_trays%rowtype;
begin
  if v_shop is null then
    return null;
  end if;
  select * into t from public.site_trays
  where shop_id = v_shop and code = upper(p_code) and created_at > now() - interval '60 days';
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'code', t.code, 'created_at', t.created_at,
    'pieces', coalesce((
      select jsonb_agg(private.site_piece_json(p.id, false) order by u.ord)
      from unnest(t.piece_ids) with ordinality as u(pid, ord)
      join public.pieces p on p.id = u.pid and p.shop_id = v_shop and p.on_website), '[]'::jsonb));
end $$;

-- A website visit (p_sku null) or piece view, once the page is really shown in a browser.
-- Skips the shop's own staff, the same visitor again within 30 minutes, and floods.
create function public.record_site_view(p_slug text, p_sku text, p_visitor text, p_viewer uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_shop uuid := private.site_shop(p_slug);
  v_piece uuid;
begin
  if v_shop is null or char_length(coalesce(p_visitor, '')) > 128 then
    return false;
  end if;
  if p_viewer is not null and exists (
    select 1 from public.shop_members m where m.shop_id = v_shop and m.user_id = p_viewer
  ) then
    return false;
  end if;
  if p_sku is not null then
    select p.id into v_piece from public.pieces p where p.shop_id = v_shop and p.sku = p_sku and p.on_website;
    if v_piece is null then
      return false;
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('siteview:' || v_shop::text, 0));
  if p_visitor is not null and exists (
    select 1 from public.site_views v
    where v.shop_id = v_shop and v.visitor_hash = p_visitor and v.piece_id is not distinct from v_piece
      and v.viewed_at > now() - interval '30 minutes'
  ) then
    return false;
  end if;
  if (select count(*) from public.site_views v where v.shop_id = v_shop and v.viewed_at > now() - interval '1 hour') >= 5000 then
    return false;
  end if;
  insert into public.site_views (shop_id, piece_id, visitor_hash) values (v_shop, v_piece, p_visitor);
  return true;
end $$;

-- ---------------------------------------------------------------- reports and the Takara dashboard

-- Takara's own team (not shop staff). Added by hand in the SQL editor; see README.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

create function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin()
$$;

-- Activity between two moments, for one shop (p_shop) or all shops (null).
-- Counts only: no client names, phone numbers or messages.
create function private.shop_stats(p_shop uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'site_visitors', (select count(distinct coalesce(v.visitor_hash, v.id::text)) from public.site_views v
                      where (p_shop is null or v.shop_id = p_shop) and v.viewed_at >= p_from and v.viewed_at < p_to),
    'piece_views', (select count(*) from public.site_views v
                    where (p_shop is null or v.shop_id = p_shop) and v.piece_id is not null
                      and v.viewed_at >= p_from and v.viewed_at < p_to),
    'trays', (select count(*) from public.site_trays t
              where (p_shop is null or t.shop_id = p_shop) and t.created_at >= p_from and t.created_at < p_to),
    'trays_whatsapp', (select count(*) from public.site_trays t
                       where (p_shop is null or t.shop_id = p_shop) and t.channel = 'whatsapp'
                         and t.created_at >= p_from and t.created_at < p_to),
    'trays_in_store', (select count(*) from public.site_trays t
                       where (p_shop is null or t.shop_id = p_shop) and t.channel = 'in_store'
                         and t.created_at >= p_from and t.created_at < p_to),
    'trays_opened', (select count(*) from public.site_trays t
                     where (p_shop is null or t.shop_id = p_shop) and t.opened_at >= p_from and t.opened_at < p_to),
    'shares', (select count(*) from public.shares s
               where (p_shop is null or s.shop_id = p_shop) and s.created_at >= p_from and s.created_at < p_to),
    'shares_opened', (select count(distinct sv.share_id) from public.share_views sv
                      join public.shares s on s.id = sv.share_id
                      where (p_shop is null or s.shop_id = p_shop) and sv.viewed_at >= p_from and sv.viewed_at < p_to),
    'sold', (select count(*) from public.pieces p
             where (p_shop is null or p.shop_id = p_shop) and p.status = 'sold' and p.sold_at >= p_from and p.sold_at < p_to),
    'sold_value', (select coalesce(sum(p.sold_value_aed), 0) from public.pieces p
                   where (p_shop is null or p.shop_id = p_shop) and p.status = 'sold' and p.sold_at >= p_from and p.sold_at < p_to),
    'sold_by', coalesce((
      select jsonb_object_agg(x.via, jsonb_build_object('count', x.n, 'value', x.v))
      from (select coalesce(p.sold_via, 'unknown') as via, count(*) as n, coalesce(sum(p.sold_value_aed), 0) as v
            from public.pieces p
            where (p_shop is null or p.shop_id = p_shop) and p.status = 'sold' and p.sold_at >= p_from and p.sold_at < p_to
            group by 1) x), '{}'::jsonb),
    'pieces_added', (select count(*) from public.pieces p
                     where (p_shop is null or p.shop_id = p_shop) and p.created_at >= p_from and p.created_at < p_to),
    'spins_added', (select count(distinct m.piece_id) from public.piece_media m
                    where (p_shop is null or m.shop_id = p_shop) and m.type = 'spin_sprite'
                      and m.created_at >= p_from and m.created_at < p_to),
    'ai_fills', (select count(*) from public.ai_requests a
                 where (p_shop is null or a.shop_id = p_shop) and a.kind = 'fill' and a.status = 'ok'
                   and a.created_at >= p_from and a.created_at < p_to),
    'ai_messages', (select count(*) from public.ai_requests a
                    where (p_shop is null or a.shop_id = p_shop) and a.kind = 'message' and a.status = 'ok'
                      and a.created_at >= p_from and a.created_at < p_to),
    'ai_tokens', coalesce((
      select jsonb_object_agg(x.model, jsonb_build_object('in', x.i, 'out', x.o))
      from (select coalesce(a.model, 'unknown') as model, coalesce(sum(a.input_tokens), 0) as i, coalesce(sum(a.output_tokens), 0) as o
            from public.ai_requests a
            where (p_shop is null or a.shop_id = p_shop) and a.created_at >= p_from and a.created_at < p_to
              and (a.input_tokens is not null or a.output_tokens is not null)
            group by 1) x), '{}'::jsonb),
    'rate_days', (select count(distinct (g.set_at at time zone 'Asia/Dubai')::date) from public.gold_rates g
                  where (p_shop is null or g.shop_id = p_shop) and g.set_at >= p_from and g.set_at < p_to))
$$;

-- Start of a calendar month in Dubai, as a moment in time.
create function private.dubai_month(p_month date) returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc('month', p_month)::date)::timestamp at time zone 'Asia/Dubai'
$$;

-- The monthly report: this month (or p_month) against the month before. Owners of the shop
-- and Takara admins only.
create function public.shop_report(p_shop uuid, p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Dubai')::date))::date;
  v_from timestamptz := private.dubai_month(v_month);
  v_to timestamptz := private.dubai_month((v_month + interval '1 month')::date);
  v_prev timestamptz := private.dubai_month((v_month - interval '1 month')::date);
begin
  if not (private.has_role(p_shop, array['owner']::public.member_role[]) or private.is_platform_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'month', v_month,
    'current', private.shop_stats(p_shop, v_from, v_to),
    'previous', private.shop_stats(p_shop, v_prev, v_from),
    'top_pieces', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'sku', x.sku, 'views', x.n) order by x.n desc, x.name)
      from (select p.id, p.name, p.sku, count(*) as n
            from public.site_views v join public.pieces p on p.id = v.piece_id
            where v.shop_id = p_shop and v.viewed_at >= v_from and v.viewed_at < v_to
            group by p.id order by n desc limit 5) x), '[]'::jsonb),
    'in_stock', (select count(*) from public.pieces p where p.shop_id = p_shop and p.status <> 'sold'),
    'with_spin', (select count(*) from public.pieces p where p.shop_id = p_shop and p.status <> 'sold'
                  and exists (select 1 from public.piece_media m where m.piece_id = p.id and m.type = 'spin_sprite')),
    'site', (select jsonb_build_object('slug', s.slug, 'published', s.published) from public.shop_sites s where s.shop_id = p_shop));
end $$;

-- Most recent moment anything happened in a shop.
create function private.shop_last_activity(p_shop uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(t) from (
    select max(created_at) as t from public.events where shop_id = p_shop
    union all select max(created_at) from public.pieces where shop_id = p_shop
    union all select max(set_at) from public.gold_rates where shop_id = p_shop
    union all select max(opened_at) from public.site_trays where shop_id = p_shop
  ) x
$$;

-- Takara dashboard: totals across shops, this month against last, and a 12-month trend.
create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', (now() at time zone 'Asia/Dubai')::date)::date;
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'month', v_month,
    'shops', (select count(*) from public.shops),
    'active_shops', (select count(*) from public.shops s where private.shop_last_activity(s.id) > now() - interval '7 days'),
    'published_sites', (select count(*) from public.shop_sites where published),
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

-- Takara dashboard: one row per shop with the last 30 days and warning flags.
create function public.admin_shops() returns jsonb
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
          'last_activity', private.shop_last_activity(s.id),
          'staff', (select count(*) from public.shop_members m where m.shop_id = s.id),
          'in_stock', (select count(*) from public.pieces p where p.shop_id = s.id and p.status <> 'sold'),
          'rates_set_at', (select max(g.set_at) from public.gold_rates g where g.shop_id = s.id),
          'site', (select jsonb_build_object('slug', ss.slug, 'published', ss.published) from public.shop_sites ss where ss.shop_id = s.id),
          'last30', private.shop_stats(s.id, v_since, now())) as r
      from public.shops s) x), '[]'::jsonb);
end $$;

-- Takara dashboard: one shop in detail: owner contact, report and recent activity.
create function public.admin_shop(p_shop uuid) returns jsonb
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
    'last_activity', private.shop_last_activity(v_shop.id),
    'staff', (select count(*) from public.shop_members m where m.shop_id = v_shop.id),
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

-- ---------------------------------------------------------------- privileges for functions

revoke all on function private.pieces_sold_fields(), private.new_tray_code(), private.site_visible(uuid),
  private.site_shop(text), private.site_piece_json(uuid, boolean), private.site_rates(uuid),
  private.is_platform_admin(), private.shop_stats(uuid, timestamptz, timestamptz), private.dubai_month(date),
  private.shop_last_activity(uuid) from public;
grant execute on function private.new_tray_code(), private.site_visible(uuid),
  private.site_shop(text), private.site_piece_json(uuid, boolean), private.site_rates(uuid),
  private.is_platform_admin(), private.shop_stats(uuid, timestamptz, timestamptz), private.dubai_month(date),
  private.shop_last_activity(uuid) to authenticated, service_role;

-- Signed-in members and admins.
revoke all on function public.set_piece_status(uuid, public.piece_status, text, numeric, uuid),
  public.set_sold_via(uuid, text), public.set_on_website(uuid, uuid[], boolean), public.open_tray(uuid, text),
  public.is_platform_admin(), public.shop_report(uuid, date), public.admin_overview(), public.admin_shops(),
  public.admin_shop(uuid) from public, anon;
grant execute on function public.set_piece_status(uuid, public.piece_status, text, numeric, uuid),
  public.set_sold_via(uuid, text), public.set_on_website(uuid, uuid[], boolean), public.open_tray(uuid, text),
  public.is_platform_admin(), public.shop_report(uuid, date), public.admin_overview(), public.admin_shops(),
  public.admin_shop(uuid) to authenticated;

-- Website functions: the server only (service role). They return making charges.
revoke all on function public.get_site(text), public.list_site_pieces(text, text, integer, numeric, numeric, text, text, integer, integer),
  public.get_site_piece(text, text), public.site_pieces(text, uuid[]), public.site_sitemap(text), public.site_media_bucket(text, text),
  public.create_tray(text, uuid[], text, text), public.get_tray(text, text), public.record_site_view(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_site(text), public.list_site_pieces(text, text, integer, numeric, numeric, text, text, integer, integer),
  public.get_site_piece(text, text), public.site_pieces(text, uuid[]), public.site_sitemap(text), public.site_media_bucket(text, text),
  public.create_tray(text, uuid[], text, text), public.get_tray(text, text), public.record_site_view(text, text, text, uuid)
  to service_role;

-- ============================================================ 20261125000100_digital_trays_showcase.sql

-- Digital trays and a showcase-only website (DECISIONS §26).
--
-- - A shop's whole catalogue is never public: others could copy its designs. Customers see
--   pieces in Digital trays the shop sends them (share links), and the website shows only a few
--   showcase pieces the owner picks (none by default, at most 12).
-- - A customer who receives a tray can tick the pieces they'd like to see, then send their
--   choice back on WhatsApp or show a code in the shop. That choice is a site_trays row linked to
--   the tray that was sent, so staff open it in the Trays tab like any other.
-- - get_share now goes through the server only (it returns making charges for pricing).
-- - schema_version() lets the app say "the database needs an update" instead of failing.

-- ---------------------------------------------------------------- showcase

alter table public.pieces alter column on_website set default false;
update public.pieces set on_website = false where on_website;

-- At most 12 unsold showcase pieces per shop: a window, not the catalogue.
create or replace function public.set_on_website(p_shop uuid, p_pieces uuid[], p_on boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not private.is_admin(p_shop) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_pieces is null or cardinality(p_pieces) > 500 then
    raise exception 'too many pieces' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('showcase:' || p_shop::text, 0));
  if p_on and (
    select count(*) from public.pieces p
    where p.shop_id = p_shop and p.status <> 'sold' and (p.on_website or p.id = any (p_pieces))
  ) > 12 then
    raise exception 'showcase_full' using errcode = 'P0001', hint = '12';
  end if;
  update public.pieces set on_website = p_on where shop_id = p_shop and id = any (p_pieces);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------- trays the shop sends

-- Links last 1 to 30 days (the salesperson chooses; 7 by default).
alter table public.shares add constraint shares_expiry_range
  check (expires_at > created_at and expires_at <= created_at + interval '31 days');

alter table public.site_trays add column share_id uuid references public.shares (id) on delete set null;
create index site_trays_share_idx on public.site_trays (share_id) where share_id is not null;

-- A sent tray as its customer sees it. Adds piece codes, the shop's logo and who to reply to on
-- WhatsApp (the shop's website number, else the salesperson who sent it). Server only.
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
revoke all on function public.get_share(text) from public, anon, authenticated;
grant execute on function public.get_share(text) to service_role;

-- The customer's answer to a tray they were sent: the pieces they'd like to see. Only pieces of
-- that tray, not sold; the same customer sending the same choice again keeps its code. Returns
-- the code, or null if the tray is no longer valid or nothing could be saved.
create function public.create_tray_from_share(p_token text, p_piece_ids uuid[], p_channel text, p_visitor text)
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
  if not found or s.revoked_at is not null or s.expires_at <= now() then
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
revoke all on function public.create_tray_from_share(text, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.create_tray_from_share(text, uuid[], text, text) to service_role;

-- ---------------------------------------------------------------- schema version

-- The app checks this once per server start and shows "the database needs an update" with the
-- steps, instead of an error, when a migration hasn't been applied yet.
create function public.schema_version() returns integer
language sql immutable set search_path = '' as $$ select 2026112501 $$;
grant execute on function public.schema_version() to anon, authenticated, service_role;

-- ============================================================ 20261126000100_shop_approval.sql

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

commit;
