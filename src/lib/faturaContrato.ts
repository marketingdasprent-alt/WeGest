import { ehRegimeTvde, numero } from '@shared/precoAluguer';
import type { PrecoSemanalTvde } from '@shared/precoAluguer';

export interface BaseFaturaContratoInput {
  regime: string | null | undefined;
  valorTotalManual: number | string | null | undefined;
  tarifaDiaria: number | string | null | undefined;
  dias: number;
  /** Preço semanal do TVDE (o que o fecho cobra); só conta em TVDE sem manual. */
  precoSemanalTvde?: PrecoSemanalTvde;
  carregando?: boolean;
  erro?: boolean;
}

export type BaseFaturaContrato =
  | { estado: 'ok'; valor: number; origem: 'manual' | 'semanal-tvde' | 'tarifa-diaria' }
  | { estado: 'a-carregar' }
  | { estado: 'erro' }
  | { estado: 'sem-preco' };

/**
 * Base do aluguer na fatura. O valor manual (ex.: 1400 €/mês a uma empresa)
 * nunca é substituído. Sem ele, um TVDE factura o preço semanal do fecho; se
 * esse não existe, não há base — nunca tarifa_diaria × dias, que diverge do fecho.
 */
export function baseFaturaContrato(input: BaseFaturaContratoInput): BaseFaturaContrato {
  const manual = numero(input.valorTotalManual);
  if (manual !== null && manual > 0) return { estado: 'ok', valor: manual, origem: 'manual' };

  if (ehRegimeTvde(input.regime)) {
    if (input.erro) return { estado: 'erro' };
    if (input.carregando || !input.precoSemanalTvde) return { estado: 'a-carregar' };
    const valor = input.precoSemanalTvde.valor;
    if (valor === null) return { estado: 'sem-preco' };
    return { estado: 'ok', valor, origem: 'semanal-tvde' };
  }
  return {
    estado: 'ok',
    valor: (numero(input.tarifaDiaria) ?? 0) * input.dias,
    origem: 'tarifa-diaria',
  };
}

/** Texto do bloqueio de emissão; `null` quando a base está pronta. */
export function motivoBaseFaturaIndisponivel(base: BaseFaturaContrato): string | null {
  if (base.estado === 'ok') return null;
  if (base.estado === 'a-carregar') return 'A carregar o preço semanal…';
  if (base.estado === 'erro') return 'Não foi possível ler o preço semanal. Tenta de novo.';
  return 'Sem preço semanal: sem valor acordado nem preço na tarifa. Define-o antes de faturar.';
}
