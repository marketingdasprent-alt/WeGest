import type { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Db = typeof supabase;

export type TicketUpdate = Database['public']['Tables']['assistencia_tickets']['Update'];
export type DecisaoSubstituta = 'devolver' | 'definitivo' | null;

/** Estados em que um ticket activo põe a viatura em manutenção (espelha a trigger da BD). */
export const ESTADOS_QUE_ENTRAM_EM_MANUTENCAO = ['disponivel', 'em_uso', 'reservada'] as const;

/**
 * Viatura em manutenção logo à abertura do ticket (nasce 'pendente', que a
 * trigger ignora de propósito). Mesmo guard da BD: inativo, vendida e
 * em_recolha ficam como estão — 0 linhas afectadas não é erro.
 */
export async function marcarViaturaEmManutencao(db: Db, viaturaId: string): Promise<void> {
  const { error } = await db
    .from('viaturas')
    .update({ status: 'manutencao' })
    .eq('id', viaturaId)
    .in('status', [...ESTADOS_QUE_ENTRAM_EM_MANUTENCAO]);
  if (error) throw error;
}

export interface FechoTicketParams {
  ticketId: string;
  /** Campos do fecho (km, combustível, fatura…); status e data_resolucao são postos aqui. */
  ticketUpdates: TicketUpdate;
  viaturaId: string;
  motoristaId: string | null;
  kmFim: number | null;
  viaturaSubstitutaId: string | null;
  substDecisao: DecisaoSubstituta;
  /** yyyy-mm-dd; por omissão, hoje. */
  hoje?: string;
}

/**
 * Grava o fecho do ticket pela ordem de que a BD precisa: a trigger que corre
 * no UPDATE do ticket para 'resolvido' decide em_uso/disponivel a partir de
 * motorista_viaturas, por isso a associação ao motorista e o destino da
 * substituta têm de estar escritos ANTES. O estado da viatura original nunca
 * é escrito aqui.
 */
export async function gravarFechoTicket(db: Db, p: FechoTicketParams): Promise<void> {
  const hoje = p.hoje ?? new Date().toISOString().split('T')[0];

  if (p.kmFim != null) {
    const { error } = await db.from('viaturas').update({ km_atual: p.kmFim }).eq('id', p.viaturaId);
    if (error) throw error;
  }

  if (p.motoristaId) {
    const { data: existente } = await db
      .from('motorista_viaturas')
      .select('id')
      .eq('motorista_id', p.motoristaId)
      .eq('viatura_id', p.viaturaId)
      .eq('status', 'ativo')
      .is('data_fim', null)
      .maybeSingle();

    if (!existente) {
      const { error } = await db.from('motorista_viaturas').insert({
        motorista_id: p.motoristaId,
        viatura_id: p.viaturaId,
        data_inicio: hoje,
        status: 'ativo',
        tipo: 'normal',
      });
      if (error) throw error;
    }
  }

  if (p.viaturaSubstitutaId && p.motoristaId) {
    if (p.substDecisao === 'devolver') {
      const { error: encerraError } = await db
        .from('motorista_viaturas')
        .update({ data_fim: hoje, status: 'encerrado' })
        .eq('viatura_id', p.viaturaSubstitutaId)
        .eq('motorista_id', p.motoristaId)
        .eq('tipo', 'substituta')
        .is('data_fim', null);
      if (encerraError) throw encerraError;

      // A BD ainda não conhece substitutas (fase 2): liberta-se à mão.
      const { error: libertaError } = await db
        .from('viaturas')
        .update({ status: 'disponivel' })
        .eq('id', p.viaturaSubstitutaId);
      if (libertaError) throw libertaError;
    } else if (p.substDecisao === 'definitivo') {
      const { error } = await db
        .from('motorista_viaturas')
        .update({ tipo: 'normal' })
        .eq('viatura_id', p.viaturaSubstitutaId)
        .eq('motorista_id', p.motoristaId)
        .eq('tipo', 'substituta')
        .is('data_fim', null);
      if (error) throw error;
    }
  }

  const { error: ticketError } = await db
    .from('assistencia_tickets')
    .update({ ...p.ticketUpdates, status: 'resolvido', data_resolucao: new Date().toISOString() })
    .eq('id', p.ticketId);
  if (ticketError) throw ticketError;
}
