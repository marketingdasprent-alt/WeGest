import type { TablesInsert } from '@/integrations/supabase/types';

interface ReservaParaPrestacao {
  id: string;
  viatura_id: string | null;
  data_inicio: string | null;
  slot_valor_mensal: number | null;
}

interface MotoristaParaPrestacao {
  id: string;
  nome: string;
  nif?: string | null;
  morada?: string | null;
  email?: string | null;
  telefone?: string | null;
}

export type ContratoPrestacaoNovo = Omit<TablesInsert<'contratos_prestacao'>, 'codigo'>;

/** Slot só tem contrato de prestação; qualquer outro regime usa contrato de renting. */
export function reservaUsaContratoRenting(regime: string | null | undefined): boolean {
  return regime !== 'slot';
}

/** Dados do contrato de prestação de uma reserva Slot. `codigo` e `org_id` vêm da BD. */
export function montarContratoPrestacao(
  reserva: ReservaParaPrestacao,
  motorista: MotoristaParaPrestacao
): ContratoPrestacaoNovo {
  return {
    motorista_id: motorista.id,
    viatura_id: reserva.viatura_id,
    reserva_id: reserva.id,
    data_inicio: reserva.data_inicio
      ? new Date(reserva.data_inicio).toISOString().split('T')[0]
      : undefined,
    // A coluna chama-se valor_semanal por legado, mas o Slot cobra-se ao mês.
    valor_semanal: reserva.slot_valor_mensal,
    motorista_nome: motorista.nome,
    motorista_nif: motorista.nif ?? null,
    motorista_morada: motorista.morada ?? null,
    motorista_email: motorista.email ?? null,
    motorista_telefone: motorista.telefone ?? null,
  };
}
