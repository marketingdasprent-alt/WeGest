import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Matrículas das viaturas atribuídas neste momento a cada motorista, indexadas pelo id do
 * motorista. Só atribuições com status 'ativo' contam: uma atribuição fechada não faz do
 * motorista alguém "com viatura".
 */
export function useMotoristasViaturasAtivas() {
  return useQuery({
    queryKey: ['motoristas-viaturas-ativas'],
    queryFn: async (): Promise<Map<string, string[]>> => {
      const { data, error } = await supabase
        .from('motorista_viaturas')
        .select('motorista_id, viatura_id, viaturas(matricula)')
        .eq('status', 'ativo')
        .not('motorista_id', 'is', null);
      if (error) throw error;

      // Chave pelo id da viatura para não contar duas vezes o mesmo veículo quando há
      // várias linhas de atribuição para ele (ver useMotoristasVariasViaturas).
      const porMotorista = new Map<string, Map<string, string>>();
      (data ?? []).forEach((linha: any) => {
        const id = linha.motorista_id as string;
        if (!id || !linha.viatura_id) return;
        const actual = porMotorista.get(id) ?? new Map<string, string>();
        actual.set(linha.viatura_id, linha.viaturas?.matricula ?? '—');
        porMotorista.set(id, actual);
      });

      return new Map(
        [...porMotorista.entries()].map(([id, matriculas]) => [id, [...matriculas.values()].sort()])
      );
    },
  });
}
