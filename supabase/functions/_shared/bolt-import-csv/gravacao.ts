// supabase/functions/_shared/bolt-import-csv/gravacao.ts
//
// Como é que uma linha do CSV da Bolt chega à bolt_resumos_semanais.
//
// Passa pela RPC bolt_resumo_merge_csv e nunca por um upsert directo. A
// diferença não é de estilo: numa integração ligada à API oficial (auth_mode =
// 'oauth') as viagens são da API, e o CSV entra só com o que só ele traz —
// campanhas, reembolsos de despesas, IVA, métricas do portal. Quem faz essa
// separação é a RPC (migração 20260813220000). Um upsert directo escreve a
// linha toda e apaga as parcelas que vieram da API.
//
// Foi o que esteve a acontecer até aqui: 6 423 linhas em produção com
// csv_importado_em a NULL e fonte_extras a NULL, porque nenhuma passou pelo
// caminho que as carimba.

/** O contexto da importação — igual para todas as linhas do mesmo ficheiro. */
export interface ContextoImportacao {
  integracaoId: string;
  /** A org da INTEGRAÇÃO, não a do utilizador que carregou o ficheiro: a RPC rejeita se divergirem. */
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

/**
 * Colunas que dão conteúdo a uma linha. Se todas vierem a zero (ou ausentes),
 * a linha não diz nada sobre a semana desse motorista.
 *
 * A lista é deliberadamente exaustiva: mais vale gravar uma linha a mais do
 * que deitar fora uma parcela de dinheiro por ela não estar aqui.
 */
const COLUNAS_COM_CONTEUDO = [
  // Dinheiro
  "ganhos_brutos_total",
  "ganhos_brutos_app",
  "ganhos_brutos_dinheiro",
  "ganhos_liquidos",
  "pagamento_previsto",
  "ganhos_campanha",
  "reembolsos_despesas",
  "gorjetas",
  "taxas_cancelamento",
  "comissoes",
  "portagens",
  "taxas_reserva",
  "dinheiro_recebido",
  "total_taxas",
  "outras_taxas",
  "reembolsos_passageiros",
  // Actividade
  "viagens_terminadas",
  "tempo_online_min",
  "distancia_total_km",
] as const;

/**
 * O CSV do portal lista TODOS os motoristas registados na empresa Bolt, não só
 * os que trabalharam na semana. Em condições normais isso não se nota, porque
 * quase todos têm ganhos.
 *
 * Nota-se quando uma frota muda de empresa: a Bolt Distancia Lisboa passou a
 * empresa 59180 em 2026-08-10, mas os 393 motoristas continuaram registados na
 * 75485. O ficheiro de 2026-09-07 trouxe as 393 linhas, das quais 392 eram
 * zeros de uma ponta à outra — e todas viraram registos na semana, a fingir
 * que eram motoristas dessa frota.
 *
 * Isto NÃO é o mesmo que o trigger fn_bolt_recusa_ganhos_sem_atividade, que
 * trava linhas COM ganhos e sem actividade (a assinatura de um ficheiro da
 * semana errada). Aqui não há ganhos nenhuns para travar.
 */
export function linhaSemConteudo(linha: Record<string, unknown>): boolean {
  return COLUNAS_COM_CONTEUDO.every((coluna) => {
    const valor = linha[coluna];
    if (valor === undefined || valor === null || valor === "") return true;
    const numero = typeof valor === "number" ? valor : Number(valor);
    return !Number.isFinite(numero) || numero === 0;
  });
}

export function construirArgsMergeCsv(
  linha: Record<string, unknown>,
  contexto: ContextoImportacao,
): ArgsMergeCsv {
  const motoristaId = linha.motorista_id;

  return {
    p_integracao_id: contexto.integracaoId,
    p_org_id: contexto.orgId,
    p_periodo: contexto.periodo,
    p_periodo_inicio: contexto.periodoInicio,
    p_periodo_fim: contexto.periodoFim,

    // A RPC lê p_valores com jsonb_populate_record sobre a própria tabela, por
    // isso o registo segue tal e qual — as colunas que ela tira dos parâmetros
    // (período, org, chave) ficam aqui dentro sem efeito.
    p_valores: linha,

    p_motorista_id: typeof motoristaId === 'string' && motoristaId ? motoristaId : null,

    // NULO de propósito, e não `true`.
    //
    // Este parâmetro é a porta de serviço da RPC: a `true` o CSV escreve as
    // viagens mesmo numa integração ligada à API oficial, saltando por cima da
    // guarda do auth_mode. Quem decide quem é dono das viagens é a RPC, não o
    // importador — pôr aqui `true` repõe exactamente o bug que a migração
    // 20260813220000 fechou.
    p_escrever_viagens: null,

    p_importado_em: contexto.importadoEm,
  };
}
