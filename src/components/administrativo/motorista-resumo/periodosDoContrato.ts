import type { ViaturaPeriodoInput } from './slotPeriodos';

export interface ContratoParaPeriodo {
  viatura_id: string | null;

  data_inicio: string | null;
  data_fim: string | null;

  valor_total_manual?: number | string | null;
  tarifa_id?: string | null;
  estado_operacional?: string | null;

  /** 'tvde' | 'rent_a_car'. Decide como se lê o `valor_total_manual`. */
  regime?: string | null;

  substituido_em?: string | null;
  viaturas?: {
    matricula?: string | null;
    modelo_id?: string | null;
    grupo_id?: string | null;
  } | null;
}

export interface TabelasDePrecoContrato {
  porTarifaModelo?: ReadonlyMap<string, number>;

  porTarifa?: Readonly<Record<string, number>>;

  porGrupo?: Readonly<Record<string, number>>;

  porModelo?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
}

function consultar(
  tabela: ReadonlyMap<string, number> | Readonly<Record<string, number>> | undefined,
  chave: string
): number | undefined {
  if (!tabela) return undefined;
  return tabela instanceof Map ? tabela.get(chave) : (tabela as Record<string, number>)[chave];
}

export interface PeriodosDeContratos {
  periodos: ViaturaPeriodoInput[];

  estimado: boolean;
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const soData = (v: string): string => v.split('T')[0];

/** Dias do período, inclusivos nas duas pontas — a mesma contagem que a edge
 *  function `fechar-semana-financeiro` usa em `diasTotaisContrato`. */
function diasDoContrato(inicio: string, fim: string): number {
  const ms = new Date(`${fim}T00:00:00Z`).getTime() - new Date(`${inicio}T00:00:00Z`).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/**
 * Override manual do rent-a-car: é o TOTAL do período, por isso rateia-se à
 * semana antes de entrar num campo `preco_semana`. Sem data de fim não há
 * período por onde ratear — nesse caso segue a tarifa, como qualquer contrato
 * sem valor acordado.
 */
function precoSemanalManualRentACar(c: ContratoParaPeriodo): number | null {
  const manual = numero(c.valor_total_manual);
  if (manual === null || !c.data_inicio || !c.data_fim) return null;
  return (manual / diasDoContrato(soData(c.data_inicio), soData(c.data_fim))) * 7;
}

function contratoContaParaAluguer(c: ContratoParaPeriodo): boolean {
  if (!c.viatura_id || !c.data_inicio) return false;
  const cancelado = (c.estado_operacional ?? '').trim().toLowerCase() === 'cancelado';
  return !cancelado || c.substituido_em != null;
}

export function periodosDeContratos(
  contratos: readonly ContratoParaPeriodo[] | null | undefined,
  tabelas: TabelasDePrecoContrato = {}
): PeriodosDeContratos {
  const periodos: ViaturaPeriodoInput[] = [];
  let estimado = false;

  for (const c of contratos ?? []) {
    if (!contratoContaParaAluguer(c)) continue;

    const modeloId = c.viaturas?.modelo_id ?? null;
    const grupoId = c.viaturas?.grupo_id ?? null;

    // `valor_total_manual` é o que se factura AO CLIENTE no período. Em TVDE
    // com renovação mensal isso é a renda do mês, e a conta-corrente do
    // condutor é semanal: lê-lo aqui metia o mês inteiro dentro de uma semana
    // (caso real do contrato #736 — 1400 €/mês a sair como 200 €/dia). A edge
    // function `fechar-semana-financeiro` só lhe toca em rent-a-car; segue-se
    // a mesma regra, para o ecrã dizer o que os livros lançam.
    const isTvde = (c.regime ?? '').trim().toLowerCase() === 'tvde';
    let preco = isTvde ? null : precoSemanalManualRentACar(c);

    if (preco === null && c.tarifa_id) {
      if (modeloId) {
        const doModelo = tabelas.porTarifaModelo?.get(`${c.tarifa_id}|${modeloId}`);
        if (doModelo !== undefined) preco = doModelo;
      }
      if (preco === null) {
        const doGrupo = tabelas.porTarifa?.[c.tarifa_id];
        if (doGrupo !== undefined) preco = doGrupo;
      }
    }

    if (preco === null) {
      const recurso =
        (grupoId ? tabelas.porGrupo?.[grupoId] : undefined) ??
        (modeloId ? consultar(tabelas.porModelo, modeloId) : undefined);
      if (recurso !== undefined) {
        preco = recurso;
        estimado = true;
      }
    }

    periodos.push({
      viatura_id: c.viatura_id as string,
      // As datas são as DO CONTRATO. É este o ponto todo deste ficheiro.
      data_inicio: soData(c.data_inicio as string),
      data_fim: c.data_fim ? soData(c.data_fim) : null,
      preco_semana: preco,
      viaturas: c.viaturas
        ? {
            matricula: c.viaturas.matricula ?? '—',
            modelo_id: modeloId,
            renting_grupos: null,
          }
        : null,
    });
  }

  return { periodos, estimado };
}
