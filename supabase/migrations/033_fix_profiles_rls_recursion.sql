-- Fix "infinite recursion detected in policy for relation profiles".
--
-- The original admin policies (001_initial_schema.sql) check admin status
-- with a subquery against the very table they're a policy on:
--   EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
-- Postgres re-evaluates RLS on that inner SELECT too, which re-triggers the
-- same policy, forever. A SECURITY DEFINER function breaks the loop by
-- running the lookup as the function owner, bypassing RLS on that one query.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

DROP POLICY IF EXISTS "profiles_admin" ON profiles;
CREATE POLICY "profiles_admin" ON profiles FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "projects_admin" ON projects;
CREATE POLICY "projects_admin" ON projects FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "usage_admin" ON usage_logs;
CREATE POLICY "usage_admin" ON usage_logs FOR ALL USING (is_admin());
