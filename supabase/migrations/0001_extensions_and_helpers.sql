-- 0001 — Extensions and shared helpers.
--
-- Everything in this file is infrastructure that later migrations depend on.
-- It is intentionally the only migration that creates functions in `public`
-- without a corresponding table.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy food/recipe search (phase 3+)

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
-- Applied as a BEFORE UPDATE trigger on every mutable table. Doing this in the
-- database rather than the client means a row edited by an Edge Function, a
-- migration or psql gets the same treatment as one edited by the app.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'BEFORE UPDATE trigger: stamps updated_at. Attach to every table with an updated_at column.';

-- ---------------------------------------------------------------------------
-- Ownership helper
-- ---------------------------------------------------------------------------
-- Used by RLS policies. `auth.uid()` returns null for an unauthenticated
-- request, and `null = anything` is null (not true), so an anonymous caller is
-- denied by default. This wrapper makes that intent explicit and keeps policy
-- bodies readable.

create or replace function public.is_owner(row_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid() is not null and auth.uid() = row_user_id;
$$;

comment on function public.is_owner is
  'True when the current request is authenticated as the given user. Basis of every user-scoped RLS policy.';
