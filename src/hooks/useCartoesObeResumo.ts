import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CartoesObeResumo {
  cartoes: { total: number; emUso: number; disponiveis: number; porTipo: Record<string, number> };
  obe: { total: number; ativos: number; semViatura: number };
}

const VAZIO: CartoesObeResumo = {
  cartoes: { total: 0, emUso: 0, disponiveis: 0, porTipo: {} },
  obe: { total: 0, ativos: 0, semViatura: 0 },
};

/**
 * Resumo das sub-tabs Administrativo › Cartões Frota e › Dispositivos OBE.
 * Só contagens — o detalhe vive nas próprias tabs.
 */
export function useCartoesObeResumo() {
  const [resumo, setResumo] = useState<CartoesObeResumo>(VAZIO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      const [{ data: cartoes, error: erroCartoes }, { data: obe, error: erroObe }] =
        await Promise.all([
          supabase.from('cartoes_frota').select('tipo, status, ativo'),
          supabase.from('dispositivos_obe').select('ativo, viatura_id'),
        ]);
      if (cancelado) return;

      if (erroCartoes || erroObe) {
        console.error('Erro ao carregar cartões/OBE:', erroCartoes ?? erroObe);
        setResumo(VAZIO);
        setLoading(false);
        return;
      }

      const porTipo: Record<string, number> = {};
      for (const c of cartoes ?? []) {
        porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + 1;
      }

      setResumo({
        cartoes: {
          total: (cartoes ?? []).length,
          emUso: (cartoes ?? []).filter((c) => c.status === 'em_uso').length,
          disponiveis: (cartoes ?? []).filter((c) => c.status === 'disponivel').length,
          porTipo,
        },
        obe: {
          total: (obe ?? []).length,
          ativos: (obe ?? []).filter((d) => d.ativo).length,
          semViatura: (obe ?? []).filter((d) => !d.viatura_id).length,
        },
      });
      setLoading(false);
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  return { resumo, loading };
}
