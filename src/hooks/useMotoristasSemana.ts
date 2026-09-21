import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  agruparPorGestor,
  escolherSemanaFechada,
  ordenarNegativos,
  type GestorContagem,
  type MotoristaNegativo,
  type Semana,
} from '@/components/dashboard/motoristas/motoristasSemana';

export interface MotoristasSemana {
  /** Null quando ainda não há nenhuma semana fechada com líquidos gravados. */
  semana: Semana | null;
  negativos: MotoristaNegativo[];
  /** Motoristas com líquido gravado nessa semana — o denominador dos negativos. */
  totalComLiquido: number;
  porGestor: GestorContagem[];
  totalMotoristas: number;
}

/**
 * Dois números do cartão da homepage: quem fechou a semana negativo e quantos
 * motoristas cada gestor tem. Ficam na mesma query porque são o mesmo cartão —
 * um só estado de loading em vez de dois blocos a aparecer em tempos
 * diferentes. O RLS trata do isolamento por organização.
 */
export function useMotoristasSemana(enabled = true) {
  return useQuery<MotoristasSemana>({
    queryKey: ['motoristas-semana'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // As semanas vêm primeiro e sozinhas: só depois de saber qual é a última
      // fechada é que vale a pena trazer as linhas dessa semana.
      const { data: semanasRaw, error: erroSemanas } = await supabase
        .from('motorista_liquido_semanal')
        .select('semana_inicio, semana_fim')
        .order('semana_inicio', { ascending: false })
        .limit(500);
      if (erroSemanas) throw erroSemanas;

      const semana = escolherSemanaFechada(semanasRaw ?? []);

      const [liquidos, motoristas] = await Promise.all([
        semana
          ? supabase
              .from('motorista_liquido_semanal')
              .select('motorista_id, motorista_nome, liquido')
              .eq('semana_inicio', semana.inicio)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('motoristas_ativos')
          .select('gestor_responsavel')
          .eq('status_ativo', true)
          .is('desativado_em', null),
      ]);
      if (liquidos.error) throw liquidos.error;
      if (motoristas.error) throw motoristas.error;

      const linhas = liquidos.data ?? [];
      const porGestor = agruparPorGestor(motoristas.data ?? []);

      return {
        semana,
        negativos: ordenarNegativos(linhas),
        totalComLiquido: linhas.length,
        porGestor,
        totalMotoristas: porGestor.reduce((s, g) => s + g.total, 0),
      };
    },
  });
}
