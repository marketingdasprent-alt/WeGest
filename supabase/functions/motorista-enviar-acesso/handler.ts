import type { AuthError, SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4';
import { z } from 'npm:zod@3.23.8';
import {
  accountCorsHeaders,
  accountErrorResponse,
  accountResponse,
  authenticateAccountRequest,
} from '../_shared/auth/accountRequests.ts';
import { CARGO_MOTORISTA_ID } from '../_shared/auth/cargoMotorista.ts';
import { AuthorizationError, requireOrgPermission } from '../_shared/auth/edgeAuthorization.ts';
import { mascararEmail } from '../_shared/auth/emailMascarado.ts';
import { urlLoginMotorista } from '../_shared/auth/loginMotoristaUrl.ts';
import { lookupPermissoesOrg } from '../_shared/auth/permissoesOrg.ts';
import { gerarSenhaProvisoria, PRAZO_HORAS } from '../_shared/auth/senhaProvisoria.ts';
import { EmailService } from '../_shared/email/services/EmailService.ts';
import { consumeRateLimit, rateLimitResponse } from '../_shared/rate-limit/rateLimit.ts';

// Nunca há email nem senha no pedido: o destino é o da conta, a senha nasce aqui.
const inputSchema = z
  .object({
    motorista_id: z.string().uuid(),
    org_id: z.string().uuid(),
    confirmar_substituicao: z.boolean().optional(),
  })
  .strict();

const RECURSO = 'motoristas_acesso_app';
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeLike = (v: string) => v.replace(/([%_\\])/g, '\\$1');

const normalizar = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

export interface EnviarAcessoDeps {
  enviarEmail?: (
    orgId: string,
    args: { to: string; nome: string; senha: string; expiraEm: Date; loginUrl: string }
  ) => Promise<{ success: boolean; error?: string }>;
  gerarSenha?: () => string;
  agora?: () => Date;
  appUrl?: string;
}

const falha = (error: string, mensagem: string, status: number) =>
  accountResponse({ success: false, error, mensagem }, status);

export async function handleEnviarAcesso(
  req: Request,
  client: SupabaseClient,
  deps: EnviarAcessoDeps = {}
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: accountCorsHeaders });
  if (req.method !== 'POST') return accountResponse({ error: 'Método não permitido' }, 405);
  try {
    const user = await authenticateAccountRequest(req, client);
    const input = inputSchema.parse(await req.json());

    const { data: ativa, error: ativaErro } = await client
      .from('user_org_ativa')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (ativaErro) throw ativaErro;
    if (ativa?.org_id !== input.org_id) {
      throw new AuthorizationError('Sem permissão nesta organização', 403);
    }
    await requireOrgPermission(user.id, input.org_id, [RECURSO], lookupPermissoesOrg(client));

    const { data: ficha, error: fichaErro } = await client
      .from('motoristas_ativos')
      .select('id, nome, email, user_id, org_id')
      .eq('id', input.motorista_id)
      .eq('org_id', input.org_id)
      .maybeSingle();
    if (fichaErro) throw fichaErro;
    if (!ficha) return falha('ficha_nao_encontrada', 'Motorista não encontrado.', 404);

    // Por alvo primeiro: um pedido barrado para este motorista não gasta a quota do staff.
    for (const quota of [
      { operation: 'enviar-acesso-alvo', identity: ficha.id, limit: 3, windowSeconds: 3600 },
      { operation: 'enviar-acesso-staff', identity: user.id, limit: 20, windowSeconds: 3600 },
    ]) {
      const limitada = rateLimitResponse(await consumeRateLimit(client, quota), accountCorsHeaders);
      if (limitada) return limitada;
    }

    let userId: string | null = ficha.user_id ?? null;
    let emailDestino = '';
    let contaCriada = false;

    if (userId) {
      const { data: conta, error: contaErro } = await client.auth.admin.getUserById(userId);
      if (contaErro || !conta?.user) {
        return falha('conta_inexistente', 'A conta associada a esta ficha já não existe.', 409);
      }
      const { data: perfil, error: perfilErro } = await client
        .from('profiles')
        .select('tipo_utilizador')
        .eq('id', userId)
        .maybeSingle();
      if (perfilErro) throw perfilErro;
      const { data: membros, error: membrosErro } = await client
        .from('user_organizacoes')
        .select('is_admin, cargo_id')
        .eq('user_id', userId);
      if (membrosErro) throw membrosErro;
      // Admin ou um cargo que não seja Motorista, em qualquer org, é de equipa.
      // Sem cargo é aceite: contas antigas de motorista ficaram sem cargo_id.
      const eStaff = (membros ?? []).some(
        (m: { is_admin?: boolean; cargo_id?: string | null }) =>
          m.is_admin === true || (m.cargo_id != null && m.cargo_id !== CARGO_MOTORISTA_ID)
      );
      if (perfil?.tipo_utilizador !== 'motorista' || eStaff) {
        return falha(
          'conta_com_outros_acessos',
          'Esta conta também é de equipa. Para não a bloquear, o acesso tem de ser tratado à parte.',
          409
        );
      }
      if (conta.user.last_sign_in_at && !input.confirmar_substituicao) {
        return falha(
          'requer_confirmacao',
          'O motorista já entrou na app. Enviar um acesso novo substitui a palavra-passe atual.',
          409
        );
      }
      if (!conta.user.email) return falha('conta_sem_email', 'A conta não tem email.', 400);
      emailDestino = conta.user.email;
    } else {
      const email = normalizar(ficha.email);
      if (!EMAIL_VALIDO.test(email)) {
        return falha('ficha_sem_email', 'A ficha não tem um email válido.', 400);
      }
      // O ilike apanha candidatas (inclusive com espaços à volta); a comparação final é normalizada.
      const { data: candidatas, error: iguaisErro } = await client
        .from('motoristas_ativos')
        .select('id, email')
        .eq('org_id', input.org_id)
        .is('user_id', null)
        .ilike('email', `%${escapeLike(email)}%`)
        .neq('id', ficha.id);
      if (iguaisErro) throw iguaisErro;
      if (
        (candidatas ?? []).some((c: { email?: string | null }) => normalizar(c.email) === email)
      ) {
        return falha(
          'fichas_duplicadas',
          'Há outra ficha com o mesmo email. Junte as fichas primeiro.',
          409
        );
      }
      // Nunca se liga a uma conta que já existe: o email da ficha não prova quem é o dono.
      const { data: existente, error: existenteErro } = await client
        .from('profiles')
        .select('id')
        .ilike('email', escapeLike(email))
        .limit(1);
      if (existenteErro) throw existenteErro;
      if ((existente ?? []).length > 0) {
        return falha(
          'email_tem_conta',
          'Já existe uma conta com este email. A ligação à ficha tem de ser feita à mão.',
          409
        );
      }

      const { data: criada, error: criarErro } = await client.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          nome: ficha.nome ?? email.split('@')[0],
          cargo_nome: 'Motorista',
          tipo_utilizador: 'motorista',
          org_id: input.org_id,
        },
        app_metadata: {
          org_id: input.org_id,
          cargo_id: CARGO_MOTORISTA_ID,
          tipo_utilizador: 'motorista',
        },
      });
      if (criarErro || !criada?.user) {
        const codigo = (criarErro as AuthError | null)?.code;
        if (codigo === 'email_exists' || codigo === 'user_already_exists') {
          return falha(
            'email_tem_conta',
            'Já existe uma conta com este email. A ligação à ficha tem de ser feita à mão.',
            409
          );
        }
        throw criarErro ?? new Error('createUser sem utilizador');
      }
      userId = criada.user.id;
      emailDestino = email;
      contaCriada = true;

      // O trigger de signup liga à ficha sem conta mais antiga com este email, que pode não ser esta.
      const { data: depois, error: depoisErro } = await client
        .from('motoristas_ativos')
        .select('user_id')
        .eq('id', ficha.id)
        .maybeSingle();
      if (depoisErro) throw depoisErro;
      if (depois?.user_id !== userId) {
        const { data: ligada, error: ligarErro } = await client
          .from('motoristas_ativos')
          .update({ user_id: userId, updated_at: (deps.agora?.() ?? new Date()).toISOString() })
          .eq('id', ficha.id)
          .is('user_id', null)
          .select('id')
          .maybeSingle();
        if (ligarErro || !ligada) {
          // Sem a ligação a conta ficaria órfã a ocupar o email; apaga-se (melhor esforço).
          await client.auth.admin.deleteUser(userId).catch(() => undefined);
          return falha(
            'ligacao_conta_falhou',
            'Não foi possível ligar a conta a esta ficha. Nada foi enviado; tente de novo.',
            409
          );
        }
      }
    }

    const senha = (deps.gerarSenha ?? gerarSenhaProvisoria)();
    const { error: senhaErro } = await client.auth.admin.updateUserById(userId, {
      password: senha,
    });
    if (senhaErro) throw senhaErro;

    const { error: registoErro } = await client.rpc('registar_acesso_provisorio', {
      p_motorista_id: ficha.id,
      p_user_id: userId,
      p_enviado_por: user.id,
      p_horas: PRAZO_HORAS,
    });
    if (registoErro) {
      // Sem registo não há prazo nem rotação: troca-se já por uma senha que ninguém conhece.
      await client.auth.admin
        .updateUserById(userId, { password: gerarSenhaProvisoria(40) })
        .catch(() => undefined);
      console.error('motorista-enviar-acesso: registo falhou');
      return falha('registo_falhou', 'Não foi possível registar o acesso. Tente de novo.', 500);
    }

    const { data: org } = await client
      .from('organizacoes')
      .select('codigo')
      .eq('id', input.org_id)
      .maybeSingle();
    const expiraEm = new Date((deps.agora?.() ?? new Date()).getTime() + PRAZO_HORAS * 3600_000);
    const enviar =
      deps.enviarEmail ??
      ((orgId, args) => new EmailService(client).sendAcessoProvisorio(orgId, args));
    const resultado = await enviar(input.org_id, {
      to: emailDestino,
      nome: ficha.nome ?? '',
      senha,
      expiraEm,
      loginUrl: urlLoginMotorista(org?.codigo, deps.appUrl ?? Deno.env.get('APP_URL') ?? undefined),
    });
    // Email falhado: a senha fica registada, o cron expira-a às 72 h e um reenvio substitui-a.
    if (!resultado.success) {
      console.error('motorista-enviar-acesso: email não entregue');
      return falha(
        'email_nao_enviado',
        'A palavra-passe foi definida mas o email não foi entregue. Tente de novo.',
        502
      );
    }

    return accountResponse({
      success: true,
      status: 'enviado',
      conta_criada: contaCriada,
      email_destino_mascarado: mascararEmail(emailDestino),
    });
  } catch (error: unknown) {
    return accountErrorResponse(error);
  }
}
