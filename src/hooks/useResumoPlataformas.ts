import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/contexts/TenantContext';

export interface ResumoPlataforma {
  plataforma: string;
  tipo_valor: 'receita' | 'custo';
  valor: number;
  valor_bruto: number | null;
  comissao: number | null;
}

export function useResumoPlataformas(periodoInicio: Date, periodoFim: Date) {
  const orgId = useOrgId();
  const [dados, setDados] = useState<ResumoPlataforma[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let cancelado = false;
    setLoading(true);

    supabase
      .rpc('dashboard_resumo_plataformas', {
        p_org_id: orgId,
        p_periodo_inicio: format(periodoInicio, 'yyyy-MM-dd'),
        p_periodo_fim: format(periodoFim, 'yyyy-MM-dd'),
      })
      .then(({ data, error }: { data: any; error: any }) => {
        if (cancelado) return;
        if (error) {
          console.error('Erro ao carregar resumo por plataforma:', error);
          setDados([]);
        } else {
          setDados(
            (data ?? []).map((r: any) => ({
              plataforma: r.plataforma,
              tipo_valor: r.tipo_valor,
              valor: Number(r.valor),
              valor_bruto: r.valor_bruto === null ? null : Number(r.valor_bruto),
              comissao: r.comissao === null ? null : Number(r.comissao),
            }))
          );
        }
        setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [orgId, periodoInicio.getTime(), periodoFim.getTime()]);

  return { dados, loading };
}
