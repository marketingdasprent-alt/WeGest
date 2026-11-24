import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { handleExpirarAcessos } from './handler.ts';

const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// A guarda corre dentro do handler, antes de qualquer leitura com privilégios.
Deno.serve((req) =>
  handleExpirarAcessos(
    req,
    createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    serviceRoleKey
  )
);
