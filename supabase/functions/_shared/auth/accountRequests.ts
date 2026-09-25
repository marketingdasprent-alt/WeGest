import { z } from 'npm:zod@3.23.8';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4';
import { authenticateUser, AuthorizationError, requireOrgAdmin } from './edgeAuthorization.ts';

export const accountCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function accountResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...accountCorsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function authenticateAccountRequest(req: Request, client: SupabaseClient) {
  return await authenticateUser(req, {
    getUser: async (token) => {
      const { data, error } = await client.auth.getUser(token);
      if (error) throw error;
      return { user: data.user };
    },
  });
}

export async function requireAccountAdmin(client: SupabaseClient, userId: string, orgId: string) {
  await requireOrgAdmin(userId, orgId, async (id, org) => {
    const { data, error } = await client.from('user_organizacoes').select('is_admin')
      .eq('user_id', id).eq('org_id', org).maybeSingle();
    if (error) throw error;
    return data;
  });
}

export function accountErrorResponse(error: unknown): Response {
  if (error instanceof AuthorizationError) return accountResponse({ error: error.message }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return accountResponse({ error: 'Pedido inválido' }, 400);
  }
  console.error('Falha na gestão de contas:', error instanceof Error ? error.name : 'erro de serviço');
  return accountResponse({ error: 'Não foi possível concluir a operação. Tente novamente.' }, 500);
}
