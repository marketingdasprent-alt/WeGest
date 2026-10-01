import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { handlePasswordRecovery } from './handler.ts';

Deno.serve((req) => handlePasswordRecovery(req, createClient(
  Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
)));
