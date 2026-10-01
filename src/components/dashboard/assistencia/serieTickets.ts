import { differenceInCalendarDays } from 'date-fns';
import {
  baldesDoIntervalo,
  chaveDoBalde,
  type DateRange,
  type Granularidade,
} from '@/components/dashboard/periodo';
import type { MovimentoTicket } from '@/hooks/useAssistenciaInicioResumo';

export interface PontoTickets {
  label: string;
  abertos: number;
  resolvidos: number;
}

/**
 * Quantas barras cabem é uma propriedade deste gráfico. Os volumes da
 * assistência são baixos (dezenas, não milhares), por isso o dia mantém-se
 * legível mais tempo do que na faturação — mas um ano ao dia continua a dar
 * 365 barras.
 */
export function granularidadeTickets(inicio: Date, fim: Date): Granularidade {
  const dias = differenceInCalendarDays(fim, inicio) + 1;
  if (dias <= 62) return 'dia';
  if (dias <= 186) return 'semana';
  return 'mes';
}

/**
 * Agrupa aberturas e resoluções nos baldes do período escolhido.
 *
 * Puro de propósito: o hook traz os movimentos ao dia uma só vez e trocar de
 * período é só voltar a somar, sem ir à base de dados.
 */
export function construirSerieTickets(
  movimentos: MovimentoTicket[],
  { from, to }: DateRange
): PontoTickets[] {
  const granularidade = granularidadeTickets(from, to);
  const baldes = baldesDoIntervalo(from, to, granularidade);
  const porChave = new Map(
    baldes.map((b) => [b.chave, { label: b.label, abertos: 0, resolvidos: 0 }])
  );

  // Ao dia, e em texto: `from`/`to` trazem hora, e comparar strings `yyyy-MM-dd`
  // evita o dia a mais ou a menos que a conversão para Date arrastaria.
  const desde = chaveDoBalde(from, 'dia');
  const ate = chaveDoBalde(to, 'dia');

  for (const m of movimentos) {
    if (m.dia < desde || m.dia > ate) continue;
    const balde = porChave.get(chaveDoBalde(new Date(`${m.dia}T00:00:00`), granularidade));
    if (!balde) continue;
    balde.abertos += m.abertos;
    balde.resolvidos += m.resolvidos;
  }

  return [...porChave.values()];
}

/** Totais do período — o que aparece ao lado do título do gráfico. */
export function totaisDaSerie(serie: PontoTickets[]) {
  return serie.reduce(
    (acc, p) => ({ abertos: acc.abertos + p.abertos, resolvidos: acc.resolvidos + p.resolvidos }),
    { abertos: 0, resolvidos: 0 }
  );
}
