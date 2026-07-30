import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Mecanico {
  id: string;
  nome: string;
  telefone: string | null;
  observacoes: string | null;
  ativo: boolean;
}

/**
 * Catálogo de mecânicos ativos da organização (sem conta/login). Usado no
 * seletor "Mecânico responsável" do ticket. RLS filtra por org.
 * `mecanicos` ainda não está nos tipos gerados → `supabase as any`.
 */
export function useMecanicos(enabled = true) {
  return useQuery({
    queryKey: ['mecanicos', 'ativos'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Mecanico[]> => {
      const { data, error } = await (supabase as any)
        .from('mecanicos')
        .select('id, nome, telefone, observacoes, ativo')
        .eq('ativo', true)
        .order('nome', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Mecanico[];
    },
  });
}

// Mutações (aqui no hook/módulo — os componentes não devem chamar supabase.from
// diretamente, ver regra no-restricted-syntax).
export async function criarMecanico(nome: string, telefone?: string | null): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('mecanicos')
    .insert({ nome, telefone: telefone || null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function atribuirMecanicoAoTicket(
  ticketId: string,
  mecanicoId: string | null
): Promise<void> {
  const { error } = await (supabase as any)
    .from('assistencia_tickets')
    .update({ mecanico_id: mecanicoId })
    .eq('id', ticketId);
  if (error) throw error;
}
