CREATE POLICY "Admins can insert profiles" ON profiles
  FOR INSERT WITH CHECK (is_admin() OR is_super_admin());
