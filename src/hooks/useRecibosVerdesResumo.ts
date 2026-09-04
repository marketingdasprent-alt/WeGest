import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RecibosVerdesResumo {
  pendentes: number;
  validados: number;
  recusados: number;
  totais: number;
}

const VAZIO: RecibosVerdesResumo = { pendentes: 0, validados: 0, recusados: 0, totais: 0 };

/**
 * Recibos verdes dos motoristas por estado de validação — a mesma tabela que a
 * ficha do motorista valida/rejeita (`motorista_recibos`).
 *
 * "Pendente" é o estado inicial `submetido`: o motorista já entregou, ainda
 * ninguém validou. É a contagem accionável das três.
 */
export function useRecibosVerdesResumo() {
  const [resumo, setResumo] = useState<RecibosVerdesResumo>(VAZIO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    supabase
      .from('motorista_recibos')
      .select('status')
      .then(({ data, error }: { data: { status: string | null }[] | null; error: unknown }) => {
        if (cancelado) return;
        if (error || !data) {
          console.error('Erro ao carregar recibos verdes:', error);
          setResumo(VAZIO);
          setLoading(false);
          return;
        }

        const contagem = data.reduce(
          (acc, row) => {
            if (row.status === 'validado') acc.validados += 1;
            else if (row.status === 'rejeitado') acc.recusados += 1;
            // Tudo o resto conta como pendente: o estado por omissão é
            // 'submetido', e uma linha sem status é igualmente um recibo à
            // espera de alguém — deixá-la de fora escondia trabalho por fazer.
            else acc.pendentes += 1;
            return acc;
          },
          { pendentes: 0, validados: 0, recusados: 0 }
        );

        setResumo({
          ...contagem,
          totais: contagem.pendentes + contagem.validados + contagem.recusados,
        });
        setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  return { resumo, loading };
}
