import { contratoDias } from './contratoDias';

export interface ContratoParaProlongar {
  data_inicio: string;
  data_fim: string | null;
  valor_total_manual?: number | string | null;
  tarifa_diaria?: number | string | null;
}

export interface CalculoProlongamento {
  diasExtra: number;
  diaria: number | null;
  valorSugerido: number | null;
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// O valor manual prevalece sobre a tarifa diária; esta só é usada sem valor acordado.
export function diariaDoContrato(contrato: ContratoParaProlongar): number | null {
  const manual = numero(contrato.valor_total_manual);
  const dias = contratoDias(contrato.data_inicio, contrato.data_fim);
  if (manual !== null && dias > 0) return manual / dias;
  return numero(contrato.tarifa_diaria);
}

export function calcularProlongamento(
  contrato: ContratoParaProlongar,
  novaDataFim: string | null
): CalculoProlongamento {
  const diasExtra = contratoDias(contrato.data_fim, novaDataFim);
  const diaria = diariaDoContrato(contrato);
  if (diasExtra <= 0 || diaria === null) {
    return { diasExtra, diaria, valorSugerido: null };
  }
  // O valor segue para faturação e tem de fechar ao cêntimo.
  return { diasExtra, diaria, valorSugerido: Math.round(diaria * diasExtra * 100) / 100 };
}

// A RPC recebe sempre valor sem IVA; a conversão é regra de negócio, não do diálogo.
// Taxa ausente ou nula não altera o valor.

const aoCentimo = (n: number): number => Math.round(n * 100) / 100;

export function semIva(valorComIva: number, taxaIva: number): number {
  if (!Number.isFinite(taxaIva) || taxaIva <= 0) return aoCentimo(valorComIva);
  return aoCentimo(valorComIva / (1 + taxaIva / 100));
}

export function comIva(valorSemIva: number, taxaIva: number): number {
  if (!Number.isFinite(taxaIva) || taxaIva <= 0) return aoCentimo(valorSemIva);
  return aoCentimo(valorSemIva * (1 + taxaIva / 100));
}
