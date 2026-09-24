import type { ContratoRenting } from '@/types/contratoRenting';

export type EstadoRenovacao = 'hoje' | 'atraso';

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
  | 'proxima_renovacao_em'
>;

function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

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

export function calcularDataFimLongaDuracao(
  dataInicio: string,
  isLongaDuracao: boolean | null | undefined,
  renovacaoOpcao: string | null | undefined,
  renovacaoIntervaloDias: number | null | undefined
): Date | null {
  if (!isLongaDuracao) return null;
  return proximaDataRenovacao(dataInicio, renovacaoOpcao, renovacaoIntervaloDias);
}

/** Dias antes do prazo a partir dos quais a BD aceita renovar um TVDE. */
export const JANELA_RENOVACAO_DIAS = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

type CicloOpcao = string | null | undefined;
type CicloIntervalo = number | null | undefined;

export type CicloRenovacaoInput = Pick<
  ContratoRenovavelInput,
  'data_inicio' | 'renovacao_opcao' | 'renovacao_intervalo_dias' | 'proxima_renovacao_em'
>;

function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate();
}

// Âncora + n meses no relógio local, dia preso ao último do mês como o
// `+ interval '1 month'` do Postgres. Conta sempre da âncora: o 31 não escorrega.
function somarMeses(ancora: Date, n: number): Date {
  const ano = ancora.getFullYear();
  const mes = ancora.getMonth() + n;
  const dia = Math.min(ancora.getDate(), diasNoMes(ano, mes));
  return new Date(
    ano,
    mes,
    dia,
    ancora.getHours(),
    ancora.getMinutes(),
    ancora.getSeconds(),
    ancora.getMilliseconds()
  );
}

// Dias de calendário, não 24 h: a hora da âncora mantém-se na mudança de hora.
function somarDias(ancora: Date, n: number): Date {
  return new Date(
    ancora.getFullYear(),
    ancora.getMonth(),
    ancora.getDate() + n,
    ancora.getHours(),
    ancora.getMinutes(),
    ancora.getSeconds(),
    ancora.getMilliseconds()
  );
}

function diasDeCalendario(de: Date, ate: Date): number {
  const a = Date.UTC(de.getFullYear(), de.getMonth(), de.getDate());
  const b = Date.UTC(ate.getFullYear(), ate.getMonth(), ate.getDate());
  return Math.round((b - a) / DIA_MS);
}

/**
 * Espelha `public.proxima_renovacao_no_ciclo`: a data mais cedo da série do
 * ciclo que fica ESTRITAMENTE depois de `depoisDe`. Hora local do browser
 * (Lisboa na prática); a BD faz a mesma conta em Europe/Lisbon.
 */
export function proximaRenovacaoNoCiclo(
  ancora: string | Date,
  opcao: CicloOpcao,
  intervalo: CicloIntervalo,
  depoisDe: string | Date
): Date {
  const a = new Date(ancora);
  const ref = new Date(depoisDe);

  if (opcao === 'mesmo_dia_cada_mes') {
    const meses = (ref.getFullYear() - a.getFullYear()) * 12 + ref.getMonth() - a.getMonth();
    if (meses < 0) return new Date(a);
    const candidato = somarMeses(a, meses);
    return candidato.getTime() > ref.getTime() ? candidato : somarMeses(a, meses + 1);
  }

  if (opcao === 'primeiro_dia_mes') {
    return new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  }

  const passo = intervalo && intervalo > 0 ? intervalo : 30;
  const dias = diasDeCalendario(a, ref);
  if (dias < 0) return new Date(a);
  const n = Math.floor(dias / passo);
  const candidato = somarDias(a, n * passo);
  return candidato.getTime() > ref.getTime() ? candidato : somarDias(a, (n + 1) * passo);
}

/** O prazo que a próxima renovação fecha — o mesmo `v_ancora` da RPC. */
export function ancoraRenovacao(c: CicloRenovacaoInput): Date {
  if (c.proxima_renovacao_em) return new Date(c.proxima_renovacao_em);
  return proximaDataRenovacao(c.data_inicio, c.renovacao_opcao, c.renovacao_intervalo_dias);
}

export interface JanelaRenovacao {
  ancora: Date;
  /** Primeiro dia (00:00) em que a BD aceita a renovação. */
  abreEm: Date;
  podeRenovar: boolean;
}

/** Comparação ao dia, como a guarda da RPC: renova-se de 7 dias antes em diante. */
export function janelaRenovacaoTvde(
  c: CicloRenovacaoInput,
  agora: Date = new Date()
): JanelaRenovacao {
  const ancora = ancoraRenovacao(c);
  const abreEm = new Date(
    ancora.getFullYear(),
    ancora.getMonth(),
    ancora.getDate() - JANELA_RENOVACAO_DIAS
  );
  return { ancora, abreEm, podeRenovar: inicioDoDia(agora).getTime() >= abreEm.getTime() };
}

/** Nova proxima_renovacao_em de um TVDE: segue o ciclo a partir do prazo, e
 *  quem renova atrasado salta logo para a ocorrência seguinte a hoje. */
export function proximaRenovacaoTvde(c: CicloRenovacaoInput, agora: Date = new Date()): Date {
  const ancora = ancoraRenovacao(c);
  const depoisDe = agora.getTime() > ancora.getTime() ? agora : ancora;
  return proximaRenovacaoNoCiclo(ancora, c.renovacao_opcao, c.renovacao_intervalo_dias, depoisDe);
}

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

export function prazoRenovacao(c: ContratoRenovavelInput): Date | null {
  // TVDE: renovar avança proxima_renovacao_em no mesmo contrato (ver
  // 20260908093000); um data_fim que lá esteja é legado das versões de 30 dias.
  if (c.regime === 'tvde' && c.proxima_renovacao_em) return new Date(c.proxima_renovacao_em);
  if (c.data_fim) return new Date(c.data_fim);
  if (c.regime === 'tvde' && c.is_longa_duracao && c.data_inicio) {
    return proximaDataRenovacao(c.data_inicio, c.renovacao_opcao, c.renovacao_intervalo_dias);
  }
  return null;
}

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

export function contratosExpiradosSemRenovacao<T extends ContratoRenovavelInput>(
  contratos: T[],
  hoje: Date = new Date()
): T[] {
  const ref = inicioDoDia(hoje);
  return contratos
    .filter(
      (c) =>
        !contratoRenovavel(c) &&
        !c.substituido_em &&
        !c.deleted_at &&
        c.estado_operacional === 'em_curso' &&
        !!c.data_fim &&
        inicioDoDia(new Date(c.data_fim)).getTime() < ref.getTime()
    )
    .sort((a, b) => new Date(a.data_fim!).getTime() - new Date(b.data_fim!).getTime());
}

/**
 * Contratos que TERMINAM no dia de referência — o botão "Terminam hoje" da
 * lista de contratos.
 *
 * Ao contrário de `contratosPorRenovar`, não filtra por renovável: entra tudo
 * o que acaba nesse dia, longa ou curta duração, TVDE ou rent-a-car. A
 * pergunta aqui não é "há renovação a propor?" mas "o que é que acaba hoje?"
 * — e a resposta a isso pode ser renovar, fechar, ou acordar datas novas.
 *
 * Fica de fora o que já não tem nada a fazer: fechado, cancelado, devolvido,
 * substituído por outra versão, apagado. Um contrato agendado ainda conta —
 * é um contrato vivo.
 *
 * A comparação é ao DIA, em hora local, como `estadoRenovacaoContrato`: um
 * contrato que acaba às 23:50 de hoje termina hoje.
 */
export function contratosTerminamHoje<T extends ContratoRenovavelInput>(
  contratos: T[],
  hoje: Date = new Date()
): T[] {
  const ref = inicioDoDia(hoje).getTime();
  return contratos.filter((c) => {
    if (!c.data_fim) return false;
    if (c.deleted_at || c.substituido_em) return false;
    if (c.estado_operacional !== 'em_curso' && c.estado_operacional !== 'agendado') return false;
    return inicioDoDia(new Date(c.data_fim)).getTime() === ref;
  });
}
