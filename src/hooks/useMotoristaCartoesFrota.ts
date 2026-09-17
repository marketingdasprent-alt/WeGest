import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/utils/errorMessage';

export type CartaoTipo = 'bp' | 'repsol' | 'edp';
export interface CartaoItem {
  id: string;
  numero: string;
  motorista_id: string | null;
}

const TIPOS: CartaoTipo[] = ['bp', 'repsol', 'edp'];

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

  // Regista a atribuição inicial para devolver o cartão anterior e fechar o período do titular.
  const atribuidoInicial = useRef<Record<CartaoTipo, string>>({ bp: '', repsol: '', edp: '' });

  useEffect(() => {
    if (!open) return;
    const loadCartoes = async () => {
      try {
        const { data } = await supabase
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
        const inicial = {
          bp: atribuido('bp'),
          repsol: atribuido('repsol'),
          edp: atribuido('edp'),
        };
        atribuidoInicial.current = { ...inicial };
        setSelectedCartao(inicial);
      } catch {}
    };
    loadCartoes();
  }, [open, motoristaId]);

  // As RPC mantêm o histórico que atribui o consumo; os erros são devolvidos
  // porque a gravação do motorista já terminou e não deve ser revertida.
  const syncCartoes = async (novoMotoristaId: string): Promise<string[]> => {
    const erros: string[] = [];

    for (const tipo of TIPOS) {
      const escolhido = selectedCartao[tipo];
      const anterior = atribuidoInicial.current[tipo];
      if (escolhido === anterior) continue;

      try {
        // Devolve primeiro para fechar o período anterior antes de reatribuir o cartão.
        if (anterior) {
          const { error } = await supabase.rpc('devolver_cartao_frota', {
            p_cartao_id: anterior,
          });
          if (error) throw error;
        }
        if (escolhido) {
          const { error } = await supabase.rpc('atribuir_cartao_frota', {
            p_cartao_id: escolhido,
            p_motorista_id: novoMotoristaId,
          });
          if (error) throw error;
        }
        atribuidoInicial.current[tipo] = escolhido;
      } catch (err: unknown) {
        erros.push(`${tipo.toUpperCase()}: ${errorMessage(err)}`);
      }
    }

    return erros;
  };

  return { cartoesFrota, selectedCartao, setSelectedCartao, syncCartoes };
}
