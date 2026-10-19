// Tradução comum das RPCs api_conta_*: erro de infraestrutura e erro de negócio do SQL.
import { ESTADO_POR_CODIGO } from './disponibilidade.ts';
import { type CodigoErro, erro } from './respostas.ts';

type ErroSql = {
  erro?: { codigo: string; mensagem: string; detalhes?: unknown; em_falta?: unknown };
};

/** Só o SQLSTATE e a RPC vão para o log: a mensagem do Postgres pode citar dados. */
export function falhouRpc(rpc: string, error: unknown, mensagem: string): Response {
  const codigo = (error as { code?: unknown }).code;
  console.error('[api-rent-a-car] conta falhou:', {
    rpc,
    codigo: typeof codigo === 'string' ? codigo : null,
  });
  return erro('ERRO_INTERNO', mensagem, 500);
}

/** A Response do { erro } que a RPC devolveu em data, ou null quando não há erro. */
export function erroDoSql(data: unknown): Response | null {
  const e = (data as ErroSql | null)?.erro;
  if (!e) return null;
  // CANDIDATURA_INCOMPLETA traz a lista em erro.em_falta: sai como detalhes.
  const detalhes = e.detalhes ?? e.em_falta;
  return erro(e.codigo as CodigoErro, e.mensagem, ESTADO_POR_CODIGO[e.codigo] ?? 400, detalhes);
}
