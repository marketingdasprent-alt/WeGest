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
  // Ao dia, e nao ao milissegundo: o pedido so tem granularidade de dia, e uma
  // dependencia em getTime() fazia o efeito voltar a correr a cada render de um
  // chamador que passasse `new Date()` — ciclo infinito de pedidos.
  const inicioStr = format(periodoInicio, 'yyyy-MM-dd');
  const fimStr = format(periodoFim, 'yyyy-MM-dd');

  useEffect(() => {
    if (!orgId) return;
    let cancelado = false;
    setLoading(true);

    supabase
      .rpc('dashboard_resumo_plataformas', {
        p_org_id: orgId,
        p_periodo_inicio: inicioStr,
        p_periodo_fim: fimStr,
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
  }, [orgId, inicioStr, fimStr]);

  return { dados, loading };
}
