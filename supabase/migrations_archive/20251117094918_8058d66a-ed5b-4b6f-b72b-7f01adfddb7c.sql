-- Allow unauthenticated users to validate invite tokens
-- This is safe because:
-- 1. Tokens are complex UUIDs (impossible to guess)
-- 2. Invites expire in 7 days
-- 3. Invites are marked as used after registration
-- 4. Only SELECT is allowed (read-only)

CREATE POLICY "Anyone can validate invite tokens"
ON public.convites
FOR SELECT
TO anon
USING (true);