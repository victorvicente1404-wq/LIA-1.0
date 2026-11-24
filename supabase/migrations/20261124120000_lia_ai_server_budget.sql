-- Server-side hard budget guard for paid Luna requests.
-- Fixed safety ceiling: R$13/month available + R$2 protected reserve, R$180/year.
-- FX reference is intentionally fixed at R$5.94/USD until a trusted server config exists.

create table if not exists public.lia_ai_usage_reservations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reserved_usd numeric(18,8) not null check (reserved_usd > 0),
  actual_usd numeric(18,8),
  status text not null default 'pending' check (status in ('pending','settled','expired')),
  input_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  output_tokens integer not null default 0
);

create index if not exists lia_ai_usage_user_created_idx
  on public.lia_ai_usage_reservations(user_id, created_at desc);

alter table public.lia_ai_usage_reservations enable row level security;
revoke all on public.lia_ai_usage_reservations from anon, authenticated;

create or replace function public.lia_reserve_ai_budget(
  p_reservation_id uuid,
  p_estimated_cost_usd numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_month_start timestamptz := date_trunc('month', now());
  v_year_start timestamptz := date_trunc('year', now());
  v_month_used numeric(18,8);
  v_year_used numeric(18,8);
  v_pending_month numeric(18,8);
  v_pending_year numeric(18,8);
  v_month_cap numeric(18,8) := 13.0 / 5.94;
  v_year_cap numeric(18,8) := 180.0 / 5.94;
begin
  if v_user is null then
    return jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  end if;
  if p_reservation_id is null or p_estimated_cost_usd is null or p_estimated_cost_usd <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_estimate');
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));
  update public.lia_ai_usage_reservations
     set status = 'expired'
   where user_id = v_user and status = 'pending' and expires_at <= now();

  select
    coalesce(sum(actual_usd) filter (where status = 'settled' and created_at >= v_month_start), 0),
    coalesce(sum(actual_usd) filter (where status = 'settled' and created_at >= v_year_start), 0),
    coalesce(sum(reserved_usd) filter (where status = 'pending' and created_at >= v_month_start), 0),
    coalesce(sum(reserved_usd) filter (where status = 'pending' and created_at >= v_year_start), 0)
  into v_month_used, v_year_used, v_pending_month, v_pending_year
  from public.lia_ai_usage_reservations
  where user_id = v_user;

  if v_month_used + v_pending_month + p_estimated_cost_usd > v_month_cap then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_limit');
  end if;
  if v_year_used + v_pending_year + p_estimated_cost_usd > v_year_cap then
    return jsonb_build_object('allowed', false, 'reason', 'annual_limit');
  end if;

  insert into public.lia_ai_usage_reservations(id, user_id, expires_at, reserved_usd)
  values (p_reservation_id, v_user, now() + interval '10 minutes', p_estimated_cost_usd);

  return jsonb_build_object('allowed', true, 'reservation_id', p_reservation_id);
exception when unique_violation then
  return jsonb_build_object('allowed', false, 'reason', 'duplicate_reservation');
end;
$$;

create or replace function public.lia_settle_ai_budget(
  p_reservation_id uuid,
  p_input_tokens integer,
  p_cached_input_tokens integer,
  p_output_tokens integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_input integer := greatest(0, coalesce(p_input_tokens, 0));
  v_cached integer := least(greatest(0, coalesce(p_cached_input_tokens, 0)), greatest(0, coalesce(p_input_tokens, 0)));
  v_output integer := greatest(0, coalesce(p_output_tokens, 0));
  v_cost numeric(18,8);
  v_updated integer;
begin
  if v_user is null or p_reservation_id is null then return false; end if;
  v_cost := (((v_input - v_cached) * 0.10) + (v_cached * 0.01) + (v_output * 0.50)) / 1000000.0;

  update public.lia_ai_usage_reservations
     set status = 'settled',
         actual_usd = v_cost,
         input_tokens = v_input,
         cached_input_tokens = v_cached,
         output_tokens = v_output
   where id = p_reservation_id
     and user_id = v_user
     and status = 'pending'
     and expires_at > now();
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.lia_reserve_ai_budget(uuid, numeric) from public;
revoke all on function public.lia_settle_ai_budget(uuid, integer, integer, integer) from public;
grant execute on function public.lia_reserve_ai_budget(uuid, numeric) to authenticated;
grant execute on function public.lia_settle_ai_budget(uuid, integer, integer, integer) to authenticated;
