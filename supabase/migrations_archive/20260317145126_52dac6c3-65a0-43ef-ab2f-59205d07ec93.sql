DROP POLICY IF EXISTS "Sistema pode criar logs Uber" ON public.uber_sync_logs;

CREATE POLICY "Admins podem criar logs Uber"
ON public.uber_sync_logs
FOR INSERT
WITH CHECK (is_current_user_admin() = true);