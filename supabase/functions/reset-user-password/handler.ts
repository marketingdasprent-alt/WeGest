import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4';
import { z } from 'npm:zod@3.23.8';
import {
  accountCorsHeaders, accountErrorResponse, accountResponse,
  authenticateAccountRequest, requireAccountAdmin,
} from '../_shared/auth/accountRequests.ts';
import { consumeRateLimit, rateLimitResponse } from '../_shared/rate-limit/rateLimit.ts';

const recoverySchema = z.object({ userId: z.string().uuid(), org_id: z.string().uuid() }).strict();

// Por alvo primeiro: um pedido barrado para aquele titular não gasta a quota do admin.
const quotasDeRecuperacao = (alvo: string, admin: string) => [
  { operation: 'reset-password-alvo', identity: alvo, limit: 3, windowSeconds: 3600 },
  { operation: 'reset-password-admin', identity: admin, limit: 20, windowSeconds: 3600 },
];

export async function handlePasswordRecovery(req: Request, client: SupabaseClient): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: accountCorsHeaders });
  if (req.method !== 'POST') return accountResponse({ error: 'Método não permitido' }, 405);
  try {
    const user = await authenticateAccountRequest(req, client);
    const input = recoverySchema.parse(await req.json());
    await requireAccountAdmin(client, user.id, input.org_id);
    const { data: member, error: memberError } = await client.from('user_organizacoes').select('is_admin')
      .eq('user_id', input.userId).eq('org_id', input.org_id).maybeSingle();
    if (memberError) throw memberError;
    if (!member) return accountResponse({ error: 'Sem acesso ao utilizador nesta organização' }, 403);

    for (const quota of quotasDeRecuperacao(input.userId, user.id)) {
      const limitada = rateLimitResponse(await consumeRateLimit(client, quota), accountCorsHeaders);
      if (limitada) return limitada;
    }

    const { data, error } = await client.auth.admin.getUserById(input.userId);
    if (error) throw error;
    if (!data.user.email) return accountResponse({ error: 'Utilizador sem email de recuperação' }, 400);

    // O endereço vem do Auth; nenhum link, token ou sessão regressa ao administrador.
    const { data: delivery, error: deliveryError } = await client.functions.invoke('send-brevo-email', {
      body: { to: data.user.email, type: 'password_recovery' },
    });
    if (deliveryError) throw deliveryError;
    if (!delivery?.success) throw new Error('Falha na entrega de recuperação');
    return accountResponse({ success: true });
  } catch (error: unknown) {
    return accountErrorResponse(error);
  }
}

