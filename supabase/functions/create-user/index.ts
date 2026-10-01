import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { handleCreateUser } from './handler.ts';

Deno.serve((req) => handleCreateUser(req, createClient(
  Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
)));
