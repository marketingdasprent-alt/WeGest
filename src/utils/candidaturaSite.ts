// Candidaturas TVDE que chegam do site pela API (origem 'site'): o que o ecrã de
// candidaturas mostra a mais, e que ficha abrir depois de aprovar. Sem React nem Supabase.

export interface CandidaturaSiteCampos {
  origem: 'portal' | 'site';
  em_formacao_tvde: boolean;
  data_inicio_pretendida: string | null;
  modelo_pretendido: { nome: string; marca: { nome: string } | null } | null;
}

/** AAAA-MM-DD → dd/mm/aaaa, fixo à mão: toLocaleDateString muda de separador entre ambientes. */
function dataCurta(dia: string): string {
  const [ano, mes, d] = dia.slice(0, 10).split('-');
  return `${d}/${mes}/${ano}`;
}

/** Linhas a mostrar no detalhe; vazio para candidaturas do portal. */
export function detalhesCandidaturaSite(
  c: CandidaturaSiteCampos
): { rotulo: string; valor: string }[] {
  if (c.origem !== 'site') return [];
  const linhas: { rotulo: string; valor: string }[] = [];
  if (c.modelo_pretendido) {
    const { nome, marca } = c.modelo_pretendido;
    linhas.push({ rotulo: 'Modelo pretendido', valor: marca ? `${marca.nome} ${nome}` : nome });
  }
  if (c.data_inicio_pretendida) {
    linhas.push({ rotulo: 'Início pretendido', valor: dataCurta(c.data_inicio_pretendida) });
  }
  if (c.em_formacao_tvde) linhas.push({ rotulo: 'Licença TVDE', valor: 'em formação' });
  return linhas;
}

/**
 * Id da ficha que aprovar_candidatura_motorista criou ou associou. A candidatura do
 * site não tem conta (user_id nulo), por isso a ficha lê-se por este id e nunca pelo user_id.
 */
export function idFichaAprovada(resultado: unknown): string | null {
  const id = (resultado as { motorista_id?: unknown } | null)?.motorista_id;
  return typeof id === 'string' && id !== '' ? id : null;
}
