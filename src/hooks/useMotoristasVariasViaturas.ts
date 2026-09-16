import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MotoristaComVariasViaturas {
  motoristaId: string;
  nome: string;
  matriculas: string[];
}

/** Deteta atribuições ativas a viaturas distintas, ignorando linhas duplicadas. */
export function useMotoristasVariasViaturas() {
  return useQuery({
    queryKey: ['motoristas-varias-viaturas'],
    queryFn: async (): Promise<MotoristaComVariasViaturas[]> => {
      const { data, error } = await supabase
        .from('motorista_viaturas')
        .select('motorista_id, viatura_id, motoristas_ativos(nome), viaturas(matricula)')
        .eq('status', 'ativo')
        .not('motorista_id', 'is', null);
      if (error) throw error;

      const porMotorista = new Map<string, { nome: string; matriculas: Map<string, string> }>();
      (data ?? []).forEach((linha: any) => {
        const id = linha.motorista_id as string;
        if (!id || !linha.viatura_id) return;
        const actual = porMotorista.get(id) ?? {
          nome: linha.motoristas_ativos?.nome ?? '—',
          matriculas: new Map<string, string>(),
        };
        // A matrícula pode mudar; o ID identifica a viatura.
        actual.matriculas.set(linha.viatura_id, linha.viaturas?.matricula ?? '—');
        porMotorista.set(id, actual);
      });

      return [...porMotorista.entries()]
        .filter(([, v]) => v.matriculas.size > 1)
        .map(([motoristaId, v]) => ({
          motoristaId,
          nome: v.nome,
          matriculas: [...v.matriculas.values()].sort(),
        }))
        .sort(
          (a, b) => b.matriculas.length - a.matriculas.length || a.nome.localeCompare(b.nome, 'pt')
        );
    },
  });
}
