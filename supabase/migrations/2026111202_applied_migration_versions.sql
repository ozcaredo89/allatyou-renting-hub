-- Issue #55: el API verifica al arrancar que todas las migraciones del repo estén aplicadas.
-- Expone (solo a service_role) las versiones registradas por `supabase db push`.
create or replace function public.applied_migration_versions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select version from supabase_migrations.schema_migrations
$$;

revoke all on function public.applied_migration_versions() from public, anon, authenticated;
grant execute on function public.applied_migration_versions() to service_role;
