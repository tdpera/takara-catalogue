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
