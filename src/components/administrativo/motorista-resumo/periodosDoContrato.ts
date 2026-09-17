import type { ViaturaPeriodoInput } from './slotPeriodos';

export interface ContratoParaPeriodo {
  viatura_id: string | null;

  data_inicio: string | null;
  data_fim: string | null;

  valor_total_manual?: number | string | null;
  tarifa_id?: string | null;
  estado_operacional?: string | null;

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

    let preco = numero(c.valor_total_manual);

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
