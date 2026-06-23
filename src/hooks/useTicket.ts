import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Ticket, Viatura, Motorista, Categoria } from '@/components/assistencia/ticket/types';

export interface TicketData {
  ticket: Ticket;
  viatura: Viatura | null;
  motorista: Motorista | null;
  categoria: Categoria | null;
  criador: { id: string; nome: string } | null;
}

/**
 * Carrega um ticket + dados relacionados (viatura, motorista, categoria, criador).
 *
 * O motorista pode vir directo de `ticket.motorista_id` ou, em fallback,
 * via `motorista_viaturas` (motorista actualmente atribuído à viatura).
 */
export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['ticket', id],
    enabled: !!id,
    queryFn: async (): Promise<TicketData> => {
      const { data: ticket, error } = await supabase
        .from('assistencia_tickets')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;

      const [viaturaRes, motoristaRes, categoriaRes, criadorRes] = await Promise.all([
        supabase
          .from('viaturas')
          .select('id, matricula, marca, modelo, km_atual')
          .eq('id', ticket.viatura_id)
          .single(),
        ticket.motorista_id
          ? supabase
              .from('motoristas_ativos')
              .select('id, nome, telefone')
              .eq('id', ticket.motorista_id)
              .single()
          : supabase
              .from('motorista_viaturas')
              .select('motoristas_ativos!motorista_id(id, nome, telefone)')
              .eq('viatura_id', ticket.viatura_id)
              .eq('status', 'ativo')
              .is('data_fim', null)
              .maybeSingle()
              .then(({ data }) => ({
                data: (data as any)?.motoristas_ativos || null,
                error: null,
              })),
        ticket.categoria_id
          ? supabase
              .from('assistencia_categorias')
              .select('id, nome, cor')
              .eq('id', ticket.categoria_id)
              .single()
          : Promise.resolve({ data: null, error: null }),
        ticket.criado_por
          ? supabase.from('profiles').select('id, nome').eq('id', ticket.criado_por).single()
          : Promise.resolve({ data: null, error: null }),
      ]);

      return {
        ticket: ticket as unknown as Ticket,
        viatura: (viaturaRes.data as Viatura | null) || null,
        motorista: (motoristaRes.data as Motorista | null) || null,
        categoria: (categoriaRes.data as Categoria | null) || null,
        criador: (criadorRes.data as { id: string; nome: string } | null) || null,
      };
    },
  });
}
