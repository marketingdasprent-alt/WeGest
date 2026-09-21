import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { inicioDaSemana, fimDaSemana, paraDataSql } from './useMotoristaExtratoPeriodo';

/**
 * O motorista já entregou os quilómetros desta semana?
 *
 * O KM é condição para receber: o pagamento é semanal e sem leitura não há
 * como saber quanto a viatura andou. Por isso a semana aqui é a MESMA do
 * resumo e do Relatório de Pagamento — segunda a domingo (`inicioDaSemana`).
 * Se fossem janelas diferentes, o painel diria "entregue" numa semana que o
 * relatório contaria noutra, e alguém pagaria a olhar para o quadro errado.
 */

export interface EstadoKmSemana {
  entregue: boolean;
  /** KM confirmado na entrega desta semana, quando existe. */
  km: number | null;
  /** Quando foi entregue. */
  em: string | null;
  semanaInicio: string;
  semanaFim: string;
}

export function useKmDaSemana(motoristaId: string | null | undefined) {
  const inicio = inicioDaSemana();
  const fim = fimDaSemana();
  const inicioSql = paraDataSql(inicio);
  const fimSql = paraDataSql(fim);

  return useQuery({
    queryKey: ['km-da-semana', motoristaId, inicioSql],
    enabled: !!motoristaId,
    queryFn: async (): Promise<EstadoKmSemana> => {
      const vazio: EstadoKmSemana = {
        entregue: false,
        km: null,
        em: null,
        semanaInicio: inicioSql,
        semanaFim: fimSql,
      };

      const { data, error } = await supabase
        .from('viatura_km_leituras')
        .select('km_confirmado, created_at')
        .eq('motorista_id', motoristaId!)
        .gte('created_at', `${inicioSql}T00:00:00`)
        // Limite exclusivo: `created_at` é timestamptz e um `lte` pela data do
        // domingo cortava fora tudo o que fosse registado nesse dia depois da
        // meia-noite — ou seja, o domingo inteiro.
        .lt('created_at', `${paraDataSql(new Date(fim.getTime() + 86_400_000))}T00:00:00`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      const linha = data?.[0];
      if (!linha) return vazio;

      return {
        entregue: true,
        km: linha.km_confirmado,
        em: linha.created_at,
        semanaInicio: inicioSql,
        semanaFim: fimSql,
      };
    },
  });
}
