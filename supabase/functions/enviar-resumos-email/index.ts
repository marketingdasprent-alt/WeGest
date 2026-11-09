import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { EmailService } from '../_shared/email/services/EmailService.ts';
import { AuthorizationError, authenticateUser } from '../_shared/auth/edgeAuthorization.ts';
import { readBoundedJson, RequestBodyError } from '../_shared/http/boundedJson.ts';
import {
  dataPt,
  enviarResumos,
  lerPedidoEnvio,
  type LinhaResumo,
} from '../_shared/resumos/envioResumosEmail.ts';

// Envio do resumo semanal por e-mail (Brevo) aos motoristas escolhidos nos
// Resumos. Lê tudo com a sessão de quem pede, por isso a RLS limita à org dele
// e só quem gere resumos passa da verificação de permissão.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const URL_APP = 'https://wegest.pt/motorista/painel';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const user = await authenticateUser(req, {
      getUser: async (token) => {
        const { data, error } = await userClient.auth.getUser(token);
        return { user: error || !data.user ? null : { id: data.user.id } };
      },
    });

    const [{ data: isAdmin }, { data: podeResumos }] = await Promise.all([
      userClient.rpc('is_current_user_admin'),
      userClient.rpc('has_permission', { _user_id: user.id, _recurso: 'administrativo_resumos' }),
    ]);
    if (!isAdmin && !podeResumos) {
      throw new AuthorizationError('Sem permissão para enviar resumos', 403);
    }

    const pedido = lerPedidoEnvio(await readBoundedJson(req, 64 * 1024));

    const { data: liquidos, error: erroLiquidos } = await userClient
      .from('motorista_liquido_semanal')
      .select('motorista_id, org_id, liquido, semana_fim')
      .eq('semana_inicio', pedido.semanaInicio)
      .in('motorista_id', pedido.motoristaIds);
    if (erroLiquidos) throw new Error(erroLiquidos.message);
    if (!liquidos?.length) return json({ enviados: 0, semEmail: [], falhados: [] });

    const { data: fichas, error: erroFichas } = await userClient
      .from('motoristas_ativos')
      .select('id, nome, email')
      .in(
        'id',
        liquidos.map((l) => l.motorista_id)
      );
    if (erroFichas) throw new Error(erroFichas.message);
    const fichaPorId = new Map((fichas ?? []).map((f) => [f.id, f]));

    const linhas: LinhaResumo[] = liquidos.map((l) => ({
      motoristaId: l.motorista_id,
      orgId: l.org_id,
      nome: fichaPorId.get(l.motorista_id)?.nome ?? 'Motorista',
      email: fichaPorId.get(l.motorista_id)?.email ?? null,
      liquido: Number(l.liquido) || 0,
      semanaFim: l.semana_fim,
    }));

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const emailService = new EmailService(admin);
    const orgIds = [...new Set(linhas.map((l) => l.orgId))];
    const { data: orgs } = await admin.from('organizacoes').select('id, nome').in('id', orgIds);
    const nomeOrg = new Map((orgs ?? []).map((o) => [o.id, o.nome as string]));

    const resultado = await enviarResumos(linhas, {
      enviarEmail: (l) =>
        emailService.sendResumoSemanal(l.orgId, {
          to: l.email!.trim(),
          motoristaNome: l.nome,
          inicioFmt: dataPt(pedido.semanaInicio),
          fimFmt: dataPt(l.semanaFim),
          liquido: l.liquido,
          empresaNome: nomeOrg.get(l.orgId),
          ctaUrl: URL_APP,
        }),
      marcarEnviados: async (ids) => {
        const { error } = await userClient.rpc('marcar_resumos_enviados', {
          p_motorista_ids: ids,
          p_semana_inicio: pedido.semanaInicio,
          p_canal: 'email',
        });
        if (error)
          throw new Error(`E-mails enviados, mas falhou publicar no perfil: ${error.message}`);
      },
    });

    return json(resultado);
  } catch (error) {
    if (error instanceof AuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : 'Erro inesperado';
    console.error('enviar-resumos-email:', message);
    return json({ error: message }, 400);
  }
});
