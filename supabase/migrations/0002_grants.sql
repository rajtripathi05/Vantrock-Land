-- Vantrock Intelligence — explicit table grants for anon/authenticated
--
-- 0001_init.sql created RLS policies ("projects_demo_access",
-- "sites_demo_access") but never explicitly GRANTed table-level privileges to
-- the anon/authenticated roles. RLS policies only take effect once a role
-- already has the underlying SQL privilege (SELECT/INSERT/UPDATE/DELETE) on
-- the table — without it, PostgREST returns "permission denied for table
-- projects" before RLS is ever evaluated. Supabase normally grants this by
-- default for tables created via the dashboard, but that default can be
-- missing depending on how/when the table was created. This migration makes
-- the grant explicit so it doesn't depend on that default.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.projects to anon, authenticated;
grant select, insert, update, delete on public.sites to anon, authenticated;
