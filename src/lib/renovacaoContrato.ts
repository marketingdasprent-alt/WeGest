/**
 * Lógica pura de renovação de contratos de renting (Rent-a-Car, longa duração).
 * A renovação em si corre server-side (RPC renovar_contrato_renting); aqui vive
 * só o cálculo da próxima data de renovação e a deteção de contratos por renovar,
 * usados pelo banner de avisos e pelo diálogo de confirmação.
 */
import type { ContratoRenting } from '@/types/contratoRenting';

export type EstadoRenovacao = 'hoje' | 'atraso';

/** Subconjunto de um contrato necessário para avaliar a renovação. */
export type ContratoRenovavelInput = Pick<
  ContratoRenting,
  | 'regime'
  | 'is_longa_duracao'
  | 'substituido_em'
  | 'estado_operacional'
  | 'data_fim'
  | 'deleted_at'
>;

function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Próxima data de renovação (fim do período) — espelha a função SQL
 * `proxima_data_renovacao`:
 *   mesmo_dia_cada_mes → +1 mês (mesmo dia)
 *   primeiro_dia_mes   → 1.º dia do mês seguinte
 *   intervalo_dias / — → +N dias (default 30)
 */
export function proximaDataRenovacao(
  dataInicio: string | Date,
  opcao: string | null | undefined,
  intervalo: number | null | undefined
): Date {
  const d = new Date(dataInicio);
  if (opcao === 'mesmo_dia_cada_mes') {
    return new Date(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes());
  }
  if (opcao === 'primeiro_dia_mes') {
    return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0);
  }
  const dias = intervalo && intervalo > 0 ? intervalo : 30;
  return new Date(d.getTime() + dias * 24 * 60 * 60 * 1000);
}

/**
 * Data de "próxima renovação" a gravar em `data_fim` quando o contrato é de
 * longa duração — null caso contrário (comportamento inalterado). Aplica-se
 * a qualquer regime: um TVDE de longa duração não tem "fim de contrato" real
 * (o motorista decide quando encerra), mas tem um ciclo de renovação/papelada
 * que precisa de uma data de referência, exactamente como o Rent-a-Car.
 */
export function calcularDataFimLongaDuracao(
  dataInicio: string,
  isLongaDuracao: boolean | null | undefined,
  renovacaoOpcao: string | null | undefined,
  renovacaoIntervaloDias: number | null | undefined
): Date | null {
  if (!isLongaDuracao) return null;
  return proximaDataRenovacao(dataInicio, renovacaoOpcao, renovacaoIntervaloDias);
}

/** Um contrato é renovável se for de longa duração, versão actual e activo. */
export function contratoRenovavel(c: ContratoRenovavelInput): boolean {
  return (
    !!c.is_longa_duracao &&
    !c.substituido_em &&
    !c.deleted_at &&
    (c.estado_operacional === 'em_curso' || c.estado_operacional === 'agendado') &&
    !!c.data_fim
  );
}

/**
 * Estado de renovação de um contrato face a uma data de referência:
 * 'hoje' (renova hoje), 'atraso' (renovação já passou) ou null (ainda não / N/A).
 */
export function estadoRenovacaoContrato(
  c: ContratoRenovavelInput,
  hoje: Date = new Date()
): EstadoRenovacao | null {
  if (!contratoRenovavel(c)) return null;
  const fim = inicioDoDia(new Date(c.data_fim as string));
  const ref = inicioDoDia(hoje);
  if (fim.getTime() > ref.getTime()) return null;
  return fim.getTime() === ref.getTime() ? 'hoje' : 'atraso';
}

export interface ContratoPorRenovar<T> {
  contrato: T;
  estado: EstadoRenovacao;
}

/**
 * Filtra e ordena os contratos por renovar (hoje + em atraso). Em atraso primeiro
 * e, dentro de cada grupo, por data_fim ascendente (o mais antigo no topo).
 */
export function contratosPorRenovar<T extends ContratoRenovavelInput>(
  contratos: T[],
  hoje: Date = new Date()
): ContratoPorRenovar<T>[] {
  const res: ContratoPorRenovar<T>[] = [];
  for (const c of contratos) {
    const estado = estadoRenovacaoContrato(c, hoje);
    if (estado) res.push({ contrato: c, estado });
  }
  return res.sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'atraso' ? -1 : 1;
    return (
      new Date(a.contrato.data_fim as string).getTime() -
      new Date(b.contrato.data_fim as string).getTime()
    );
  });
}
