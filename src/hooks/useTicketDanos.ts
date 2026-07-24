import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TicketDanoFoto {
  id: string;
  ficheiro_url: string;
  nome_ficheiro: string | null;
  descricao: string | null;
}

export interface TicketDano {
  id: string;
  descricao: string;
  localizacao: string | null;
  data_ocorrencia: string | null;
  created_at: string;
  categoria: { id: string; nome: string; cor: string | null } | null;
  fotos: TicketDanoFoto[];
}

/** Danos ligados a um ticket de assistência (viatura_danos.ticket_id),
 * incl. categoria e fotos, para exibição read-only em TicketSidebar. */
export function useTicketDanos(ticketId: string | undefined) {
  return useQuery({
    queryKey: ['ticket-danos', ticketId],
    enabled: !!ticketId,
    queryFn: async (): Promise<TicketDano[]> => {
      const { data, error } = await supabase
        .from('viatura_danos')
        .select(
          `
          id,
          descricao,
          localizacao,
          data_ocorrencia,
          created_at,
          categoria:assistencia_categorias(id, nome, cor)
        `
        )
        .eq('ticket_id', ticketId!)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const danos: TicketDano[] = [];
      for (const dano of (data || []) as unknown as Array<Omit<TicketDano, 'fotos'>>) {
        const { data: fotos } = await supabase
          .from('viatura_dano_fotos')
          .select('id, ficheiro_url, nome_ficheiro, descricao')
          .eq('dano_id', dano.id);

        danos.push({ ...dano, fotos: fotos || [] });
      }
      return danos;
    },
  });
}
