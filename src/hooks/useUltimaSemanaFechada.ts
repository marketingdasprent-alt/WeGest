import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SemanaFechada {
  inicio: Date;
  fim: Date;
}

/**
 * A semana mais recente com contas fechadas.
 *
 * O resumo por motorista só existe depois de o período ser fechado (é o que
 * escreve `motorista_resumo_semanal`), por isso a semana em curso não tem
 * números. Quem quiser mostrar contas fora do separador Administrativo tem de
 * mostrar esta — a última fechada — e dizer qual é.
 */
export function useUltimaSemanaFechada() {
  const [semana, setSemana] = useState<SemanaFechada | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    supabase
      .from('motorista_resumo_semanal')
      .select('semana_inicio, semana_fim')
      .order('semana_inicio', { ascending: false })
      .limit(1)
      .then(
        ({
          data,
          error,
        }: {
          data: { semana_inicio: string; semana_fim: string }[] | null;
          error: unknown;
        }) => {
          if (cancelado) return;
          if (error) {
            console.error('Erro ao procurar a última semana fechada:', error);
            setSemana(null);
          } else if (data && data.length > 0) {
            // 'T00:00:00' sem sufixo de fuso: a data é um dia de calendário,
            // e `new Date('2026-09-01')` seria interpretado como UTC, podendo
            // recuar um dia em Portugal.
            setSemana({
              inicio: new Date(`${data[0].semana_inicio}T00:00:00`),
              fim: new Date(`${data[0].semana_fim}T00:00:00`),
            });
          } else {
            setSemana(null);
          }
          setLoading(false);
        }
      );

    return () => {
      cancelado = true;
    };
  }, []);

  return { semana, loading };
}
