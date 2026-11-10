import { addDays, addWeeks, format, isBefore, startOfWeek } from 'date-fns';
import { pt } from 'date-fns/locale';

import { CONTAS_VALIDAS_DESDE } from './dashboardStats';

export interface SemanaOption {
  value: string;
  label: string;
  jaTemRecibo: boolean;
}

const SEGUNDA = { weekStartsOn: 1 } as const;

/**
 * Semanas a que o motorista pode associar um recibo verde: do início das contas
 * (ou da contratação, se for depois) até à semana em curso, mais recente primeiro.
 * Sem data de contratação começa no início das contas — antes devolvia uma lista
 * vazia e o recibo ficava preso sem semana (56 fichas ativas a 10/11/2026).
 */
export function semanasParaRecibo(
  dataContratacao: string | null | undefined,
  semanasComRecibo: ReadonlySet<string>,
  hoje: Date = new Date()
): SemanaOption[] {
  const inicioContas = startOfWeek(new Date(`${CONTAS_VALIDAS_DESDE}T12:00:00`), SEGUNDA);
  const daContratacao = dataContratacao
    ? startOfWeek(new Date(`${dataContratacao.slice(0, 10)}T12:00:00`), SEGUNDA)
    : inicioContas;
  let inicio = isBefore(daContratacao, inicioContas) ? inicioContas : daContratacao;
  const fim = startOfWeek(hoje, SEGUNDA);

  const semanas: SemanaOption[] = [];
  while (!isBefore(fim, inicio)) {
    const valor = format(inicio, 'yyyy-MM-dd');
    semanas.push({
      value: valor,
      label: `${format(inicio, 'dd MMM', { locale: pt })} - ${format(addDays(inicio, 6), 'dd MMM yyyy', { locale: pt })}`,
      jaTemRecibo: semanasComRecibo.has(valor),
    });
    inicio = addWeeks(inicio, 1);
  }
  return semanas.reverse();
}
