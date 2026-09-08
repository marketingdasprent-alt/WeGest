import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MotoristaComVariasViaturas {
  motoristaId: string;
  nome: string;
  matriculas: string[];
}

/**
 * Motoristas com mais do que uma viatura DISTINTA atribuída ao mesmo tempo.
 *
 * Um motorista conduz um carro de cada vez. Duas atribuições activas para
 * veículos diferentes querem sempre dizer que algo ficou por fechar — uma
 * substituição temporária que nunca foi encerrada, ou uma troca feita fora do
 * fluxo de troca. Caso real: a Lucia Duceac ficou com a AC-41-ES e a BM-60-FC
 * abertas no mesmo dia, criadas pela mesma pessoa, uma delas com o motivo
 * "Substituição temporária".
 *
 * Conta viaturas distintas, não linhas: várias linhas para o MESMO veículo são
 * duplicação de registo (acontece, e o cálculo semanal já une os dias — ver
 * buildSlotPeriodos), não um motorista com dois carros. O Marco Reis tem três
 * linhas activas, todas da BL-22-IP: não é caso para este aviso.
 */
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
        // Chave pelo id da viatura: é o que distingue veículos, não a matrícula.
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
        .sort((a, b) => b.matriculas.length - a.matriculas.length || a.nome.localeCompare(b.nome, 'pt'));
    },
  });
}
