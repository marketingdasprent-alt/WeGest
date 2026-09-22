import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Histórico de acertos semanais do motorista, para o portal dele.
 *
 * Lê `motorista_liquido_semanal` — o mesmo número que o Relatório de Pagamento
 * usa e que entra na conta corrente. O cartão que mostra isto procurava antes
 * PDFs em `motorista_recibos` com tipo 'relatorio', dos quais nunca existiu um
 * único: aparecia sempre vazio enquanto o histórico real estava nesta tabela.
 *
 * O PDF, quando existe, é um extra e não a fonte: junta-se por
 * `semana_referencia_inicio` para quem quiser descarregar a folha.
 */

export interface ResumoSemanalMotorista {
  semanaInicio: string;
  semanaFim: string;
  liquido: number;
  /** Caminho no bucket `motorista-recibos`, quando houve PDF gerado. */
  ficheiroUrl: string | null;
  descricao: string | null;
}

export function useMotoristaResumosSemanais(motoristaId: string | null | undefined) {
  return useQuery({
    queryKey: ['motorista-resumos-semanais', motoristaId],
    enabled: !!motoristaId,
    queryFn: async (): Promise<ResumoSemanalMotorista[]> => {
      const { data, error } = await supabase
        .from('motorista_liquido_semanal')
        .select('semana_inicio, semana_fim, liquido')
        .eq('motorista_id', motoristaId!)
        .order('semana_inicio', { ascending: false })
        .limit(52);
      if (error) throw error;
      if (!data?.length) return [];

      // Os PDFs são opcionais: se a consulta falhar (ou não houver nenhum), o
      // histórico mostra-se na mesma, só sem botão de descarregar.
      const { data: pdfs } = await supabase
        .from('motorista_recibos')
        .select('semana_referencia_inicio, ficheiro_url, descricao')
        .eq('motorista_id', motoristaId!)
        .eq('tipo', 'relatorio');

      const porSemana = new Map(
        (pdfs ?? [])
          .filter((p) => p.semana_referencia_inicio)
          .map((p) => [p.semana_referencia_inicio as string, p])
      );

      return data.map((r) => {
        const pdf = porSemana.get(r.semana_inicio);
        return {
          semanaInicio: r.semana_inicio,
          semanaFim: r.semana_fim,
          liquido: Number(r.liquido) || 0,
          ficheiroUrl: pdf?.ficheiro_url ?? null,
          descricao: pdf?.descricao ?? null,
        };
      });
    },
  });
}
