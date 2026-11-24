import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { handleEnviarAcesso } from './handler.ts';

Deno.serve((req) =>
  handleEnviarAcesso(
    req,
    createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  )
);
