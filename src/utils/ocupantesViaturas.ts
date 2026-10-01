import { differenceInCalendarDays, parseISO } from 'date-fns';

export interface OcupanteViatura {
  tipo: 'motorista' | 'cliente';
  id: string;
  nome: string;
  /** Contrato de renting que liga o cliente à viatura. */
  contratoId?: string;
}

export interface SituacaoViatura {
  /** Quem tem a viatura agora (motorista associado, ou cliente de contrato em curso). */
  ocupante?: OcupanteViatura;
  /** Dia em que terminou a última ocupação (associação ou contrato). */
  livreDesde?: string;
}

export interface AssociacaoMotorista {
  viatura_id: string;
  status: string | null;
  data_fim: string | null;
  motorista: { id: string; nome: string | null } | null;
}

export interface ContratoViatura {
  id: string;
  viatura_id: string;
  estado_operacional: string;
  data_fim: string | null;
  cliente: { id: string; nome: string | null; nome_comercial?: string | null } | null;
}

const CONTRATO_EM_CURSO = new Set(['agendado', 'em_curso']);
const CONTRATO_TERMINADO = new Set(['devolvido', 'fechado']);

const maisRecente = (a: string | undefined, b: string | null) => (!b ? a : !a || b > a ? b : a);

/**
 * Por viatura: quem a tem e desde quando está livre. O motorista associado
 * (status ativo, sem data_fim — o critério de todo o código) ganha ao contrato.
 */
export function situacaoViaturas(
  associacoes: readonly AssociacaoMotorista[],
  contratos: readonly ContratoViatura[]
): Map<string, SituacaoViatura> {
  const mapa = new Map<string, SituacaoViatura>();
  const de = (id: string) => {
    let s = mapa.get(id);
    if (!s) mapa.set(id, (s = {}));
    return s;
  };

  for (const c of contratos) {
    const s = de(c.viatura_id);
    if (CONTRATO_EM_CURSO.has(c.estado_operacional) && c.cliente && !s.ocupante) {
      const nome = c.cliente.nome_comercial || c.cliente.nome || 'Cliente';
      s.ocupante = { tipo: 'cliente', id: c.cliente.id, nome, contratoId: c.id };
    } else if (CONTRATO_TERMINADO.has(c.estado_operacional)) {
      s.livreDesde = maisRecente(s.livreDesde, c.data_fim);
    }
  }

  for (const a of associacoes) {
    const s = de(a.viatura_id);
    if (a.status === 'ativo' && !a.data_fim && a.motorista) {
      s.ocupante = { tipo: 'motorista', id: a.motorista.id, nome: a.motorista.nome || 'Motorista' };
    } else if (a.data_fim) {
      s.livreDesde = maisRecente(s.livreDesde, a.data_fim);
    }
  }
  return mapa;
}

/** Dias desde que a viatura ficou livre; negativo quando o fim está marcado no futuro. */
export function diasLivre(livreDesde: string | undefined, hoje: Date = new Date()): number | null {
  if (!livreDesde) return null;
  return differenceInCalendarDays(hoje, parseISO(livreDesde.slice(0, 10)));
}
