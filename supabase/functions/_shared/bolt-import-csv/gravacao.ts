/** A RPC preserva dados da API oficial que um upsert CSV apagaria. */
export interface ContextoImportacao {
  integracaoId: string;
  /** A RPC valida a organização da integração, não a do utilizador. */
  orgId: string;
  periodo: string;
  periodoInicio: string;
  periodoFim: string;
  importadoEm: string;
}

export interface ArgsMergeCsv {
  p_integracao_id: string;
  p_org_id: string;
  p_periodo: string;
  p_periodo_inicio: string;
  p_periodo_fim: string;
  p_valores: Record<string, unknown>;
  p_motorista_id: string | null;
  p_escrever_viagens: boolean | null;
  p_importado_em: string;
}

/** Lista exaustiva para não descartar parcelas financeiras. */
const COLUNAS_COM_CONTEUDO = [
  'ganhos_brutos_total',
  'ganhos_brutos_app',
  'ganhos_brutos_dinheiro',
  'ganhos_liquidos',
  'pagamento_previsto',
  'ganhos_campanha',
  'reembolsos_despesas',
  'gorjetas',
  'taxas_cancelamento',
  'comissoes',
  'portagens',
  'taxas_reserva',
  'dinheiro_recebido',
  'total_taxas',
  'outras_taxas',
  'reembolsos_passageiros',
  'viagens_terminadas',
  'tempo_online_min',
  'distancia_total_km',
] as const;

/** Ignora motoristas sem atividade que o CSV lista após mudanças de frota. */
export function linhaSemConteudo(linha: Record<string, unknown>): boolean {
  return COLUNAS_COM_CONTEUDO.every((coluna) => {
    const valor = linha[coluna];
    if (valor === undefined || valor === null || valor === '') return true;
    const numero = typeof valor === 'number' ? valor : Number(valor);
    return !Number.isFinite(numero) || numero === 0;
  });
}

export function construirArgsMergeCsv(
  linha: Record<string, unknown>,
  contexto: ContextoImportacao
): ArgsMergeCsv {
  const motoristaId = linha.motorista_id;

  return {
    p_integracao_id: contexto.integracaoId,
    p_org_id: contexto.orgId,
    p_periodo: contexto.periodo,
    p_periodo_inicio: contexto.periodoInicio,
    p_periodo_fim: contexto.periodoFim,

    p_valores: linha,

    p_motorista_id: typeof motoristaId === 'string' && motoristaId ? motoristaId : null,

    // Só a RPC decide se o CSV pode escrever viagens da API oficial.
    p_escrever_viagens: null,

    p_importado_em: contexto.importadoEm,
  };
}
