-- Account for GPT-6 Luna cache-write tokens at their higher Standard input rate.
-- Run after 20261124120000_lia_ai_server_budget.sql.

alter table public.lia_ai_usage_reservations
  add column if not exists cache_write_input_tokens integer not null default 0;

-- Replace the earlier settlement signature so callers must report cache writes too.
drop function if exists public.lia_settle_ai_budget(uuid, integer, integer, integer);

create or replace function public.lia_settle_ai_budget(
  p_reservation_id uuid,
  p_input_tokens integer,
  p_cached_input_tokens integer,
  p_cache_write_tokens integer,
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
  v_cache_write integer := least(
    greatest(0, coalesce(p_cache_write_tokens, 0)),
    greatest(0, coalesce(p_input_tokens, 0)) - least(greatest(0, coalesce(p_cached_input_tokens, 0)), greatest(0, coalesce(p_input_tokens, 0)))
  );
  v_output integer := greatest(0, coalesce(p_output_tokens, 0));
  v_uncached integer;
  v_cost numeric(18,8);
  v_updated integer;
begin
  if v_user is null or p_reservation_id is null then return false; end if;

  v_uncached := greatest(0, v_input - v_cached - v_cache_write);
  v_cost := ((v_uncached * 0.10) + (v_cached * 0.01) + (v_cache_write * 0.125) + (v_output * 0.50)) / 1000000.0;

  update public.lia_ai_usage_reservations
     set status = 'settled',
         actual_usd = v_cost,
         input_tokens = v_input,
         cached_input_tokens = v_cached,
         cache_write_input_tokens = v_cache_write,
         output_tokens = v_output
   where id = p_reservation_id
     and user_id = v_user
     and status = 'pending'
     and expires_at > now();
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.lia_settle_ai_budget(uuid, integer, integer, integer, integer) from public;
grant execute on function public.lia_settle_ai_budget(uuid, integer, integer, integer, integer) to authenticated;
