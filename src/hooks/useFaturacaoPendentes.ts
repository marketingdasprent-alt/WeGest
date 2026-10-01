import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FaturacaoPendentes {
  count: number;
  valor: number;
}

const VAZIO: FaturacaoPendentes = { count: 0, valor: 0 };

/**
 * Cobranças criadas e ainda por emitir — trabalho por fazer, sem recorte de
 * tempo.
 *
 * Substituiu um `useFaturacaoResumoPeriodo(mês)`: uma cobrança de Agosto que
 * ninguém emitiu continua por emitir hoje, e a janela do mês corrente
 * escondia-a. É o mesmo raciocínio do "Em atraso", que vem de
 * `useContasAReceber` justamente por não ter janela.
 */
export function useFaturacaoPendentes() {
  const [pendentes, setPendentes] = useState<FaturacaoPendentes>(VAZIO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    supabase
      .from('contrato_cobrancas')
      .select('valor_total')
      .eq('estado', 'pendente')
      .then(
        ({ data, error }: { data: { valor_total: number | null }[] | null; error: unknown }) => {
          if (cancelado) return;
          if (error || !data) {
            console.error('Erro ao carregar cobranças por emitir:', error);
            setPendentes(VAZIO);
            setLoading(false);
            return;
          }
          setPendentes({
            count: data.length,
            valor: data.reduce((s, r) => s + (Number(r.valor_total) || 0), 0),
          });
          setLoading(false);
        }
      );

    return () => {
      cancelado = true;
    };
  }, []);

  return { pendentes, loading };
}
