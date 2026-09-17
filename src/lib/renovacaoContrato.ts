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
