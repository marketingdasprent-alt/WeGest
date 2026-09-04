import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RecibosVerdesResumo {
  pendentes: number;
  validados: number;
  recusados: number;
  totais: number;
}

const VAZIO: RecibosVerdesResumo = { pendentes: 0, validados: 0, recusados: 0, totais: 0 };

/** Contagem de entradas do Financeiro Manual por estado de validação. */
export function useRecibosVerdesResumo() {
  const [resumo, setResumo] = useState<RecibosVerdesResumo>(VAZIO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from('motorista_financeiro')
      .select('status')
      .in('status', ['pendente', 'validado', 'rejeitado'])
      .then(({ data, error }: { data: { status: string }[] | null; error: unknown }) => {
        if (cancelado) return;
        if (error || !data) {
          setResumo(VAZIO);
          setLoading(false);
          return;
        }
        const contagem = data.reduce(
          (acc, row) => {
            if (row.status === 'pendente') acc.pendentes += 1;
            else if (row.status === 'validado') acc.validados += 1;
            else if (row.status === 'rejeitado') acc.recusados += 1;
            return acc;
          },
          { pendentes: 0, validados: 0, recusados: 0 }
        );
        setResumo({ ...contagem, totais: contagem.pendentes + contagem.validados + contagem.recusados });
        setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return { resumo, loading };
}
