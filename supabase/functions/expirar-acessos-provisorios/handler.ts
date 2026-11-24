import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4';
import { AuthorizationError, requireInternalRequest } from '../_shared/auth/edgeAuthorization.ts';
import { gerarSenhaProvisoria } from '../_shared/auth/senhaProvisoria.ts';

const headers = { 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

// Só o cron (service role) chama isto. Falhas por linha não param as restantes;
// a linha que falha fica por marcar e volta a ser tentada na volta seguinte.
export async function handleExpirarAcessos(
  req: Request,
  client: SupabaseClient,
  serviceRoleKey: string
): Promise<Response> {
  try {
    requireInternalRequest(req, serviceRoleKey);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) return json({ error: error.message }, error.status);
    throw error;
  }

  // Reclamar primeiro: as senhas que o motorista já mudou ficam "trocadas" na base e nunca chegam aqui.
  const { data, error } = await client.rpc('reclamar_acessos_provisorios_expirados');
  if (error) {
    console.error('expirar-acessos-provisorios: reclamação falhou');
    return json({ success: false, error: 'Falha ao reclamar acessos expirados' }, 500);
  }
  const linhas: { id: string; user_id: string }[] = data ?? [];

  let expirados = 0;
  let falhados = 0;
  for (const linha of linhas) {
    try {
      // Sobra uma janela minúscula: se o staff reenviar entre a reclamação e esta rotação, a
      // senha nova é rodada; o motorista pede outro envio.
      const { error: rodarErro } = await client.auth.admin.updateUserById(linha.user_id, {
        password: gerarSenhaProvisoria(40),
      });
      if (rodarErro) {
        // Sem rotação a linha volta a estar livre para a próxima volta tentar de novo.
        await client.rpc('libertar_acesso_provisorio', { p_id: linha.id });
        throw rodarErro;
      }
      const { error: sessoesErro } = await client.rpc('revogar_sessoes_utilizador', {
        p_user_id: linha.user_id,
      });
      if (sessoesErro) throw sessoesErro;
      expirados++;
    } catch (erro: unknown) {
      falhados++;
      console.error(
        'expirar-acessos-provisorios: linha falhou',
        erro instanceof Error ? erro.name : 'erro'
      );
    }
  }
  return json({ success: true, total: linhas.length, expirados, falhados });
}
