/**
 * Lógica pura de renovação de contratos de renting de longa duração (Rent-a-Car e TVDE).
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
  | 'data_inicio'
  | 'data_fim'
  | 'renovacao_opcao'
  | 'renovacao_intervalo_dias'
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

/** Um contrato é renovável se for rent-a-car ou TVDE de longa duração, versão
 *  actual e **em curso**. Rent-a-car exige data_fim; TVDE pode não ter (contratos
 *  antigos, criados antes da data_fim automática de longa duração) — nesse
 *  caso a 1.ª renovação arranca o ciclo a partir de hoje (a RPC usa
 *  COALESCE(data_fim, now())) e daí em diante comporta-se como rent-a-car.
 *
 *  Exige 'em_curso' (e não 'agendado'): renovar pressupõe que a viatura está
 *  com o cliente e que o período anterior correu. Renovar um contrato apenas
 *  agendado propagava o estado 'agendado' para o período novo — era assim que
 *  contratos renovados ficavam por abrir. A RPC renovar_contrato_renting
 *  aplica a mesma regra server-side. */
export function contratoRenovavel(c: ContratoRenovavelInput): boolean {
  return (
    (c.regime === 'rent_a_car' || c.regime === 'tvde') &&
    !!c.is_longa_duracao &&
    !c.substituido_em &&
    !c.deleted_at &&
    c.estado_operacional === 'em_curso' &&
    (!!c.data_fim || c.regime === 'tvde')
  );
}

/**
 * Prazo de renovação EFECTIVO de um contrato:
 *   · com data_fim → a própria data_fim (rent-a-car e TVDE já ciclados);
 *   · TVDE de longa duração SEM data_fim → prazo VIRTUAL = data_início + ciclo
 *     de renovação (default 30 dias). Regra do negócio: TODO o TVDE renova a
 *     cada 30 dias, por isso mesmo sem data_fim gravada tem um prazo a cumprir.
 *     A 1.ª renovação grava a data_fim real (a RPC usa COALESCE(data_fim, now())).
 */
export function prazoRenovacao(c: ContratoRenovavelInput): Date | null {
  if (c.data_fim) return new Date(c.data_fim);
  if (c.regime === 'tvde' && c.is_longa_duracao && c.data_inicio) {
    return proximaDataRenovacao(c.data_inicio, c.renovacao_opcao, c.renovacao_intervalo_dias);
  }
  return null;
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
  const prazo = prazoRenovacao(c);
  if (!prazo) return null;
  const fim = inicioDoDia(prazo);
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
 * e, dentro de cada grupo, por prazo ascendente (o mais antigo no topo). O prazo
 * é a data_fim ou, em TVDE sem data_fim, o prazo virtual (ver prazoRenovacao).
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
      (prazoRenovacao(a.contrato)?.getTime() ?? 0) - (prazoRenovacao(b.contrato)?.getTime() ?? 0)
    );
  });
}
