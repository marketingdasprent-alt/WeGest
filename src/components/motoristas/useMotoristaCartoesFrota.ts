import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type CartaoTipo = 'bp' | 'repsol' | 'edp';
export interface CartaoItem {
  id: string;
  numero: string;
  motorista_id: string | null;
}

const TIPOS: CartaoTipo[] = ['bp', 'repsol', 'edp'];

/** Cartões de frota (BP/Repsol/EDP) disponíveis para atribuir ao motorista —
 *  carrega ao abrir o dialog, e sincroniza a atribuição ao gravar. */
export function useMotoristaCartoesFrota(open: boolean, motoristaId: string | undefined) {
  const [cartoesFrota, setCartoesFrota] = useState<Record<CartaoTipo, CartaoItem[]>>({
    bp: [],
    repsol: [],
    edp: [],
  });
  const [selectedCartao, setSelectedCartao] = useState<Record<CartaoTipo, string>>({
    bp: '',
    repsol: '',
    edp: '',
  });

  useEffect(() => {
    if (!open) return;
    const loadCartoes = async () => {
      try {
        const { data } = await (supabase as any)
          .from('cartoes_frota')
          .select('id, numero, tipo, motorista_id')
          .eq('ativo', true)
          .order('numero');
        const all = (data || []) as (CartaoItem & { tipo: string })[];
        const filterTipo = (t: string) =>
          all.filter((c) => c.tipo === t && (!c.motorista_id || c.motorista_id === motoristaId));
        setCartoesFrota({
          bp: filterTipo('bp'),
          repsol: filterTipo('repsol'),
          edp: filterTipo('edp'),
        });
        const atribuido = (t: string) =>
          all.find((c) => c.tipo === t && c.motorista_id === motoristaId)?.id || '';
        setSelectedCartao({
          bp: atribuido('bp'),
          repsol: atribuido('repsol'),
          edp: atribuido('edp'),
        });
      } catch {
        /* silencioso */
      }
    };
    loadCartoes();
  }, [open, motoristaId]);

  const syncCartoes = async (novoMotoristaId: string) => {
    try {
      for (const tipo of TIPOS) {
        const cartaoId = selectedCartao[tipo];
        await (supabase as any)
          .from('cartoes_frota')
          .update({ motorista_id: null })
          .eq('tipo', tipo)
          .eq('motorista_id', novoMotoristaId)
          .neq('id', cartaoId || '00000000-0000-0000-0000-000000000000');
        if (cartaoId) {
          await (supabase as any)
            .from('cartoes_frota')
            .update({ motorista_id: novoMotoristaId })
            .eq('id', cartaoId);
        }
      }
    } catch {
      /* silencioso — não bloqueia o save do motorista */
    }
  };

  return { cartoesFrota, selectedCartao, setSelectedCartao, syncCartoes };
}
