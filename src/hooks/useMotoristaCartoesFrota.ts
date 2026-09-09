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

  /**
   * O que estava atribuído quando o diálogo abriu. Sem isto não se sabe o que
   * mudou, e "devolver o anterior" viraria um palpite — a devolução é o que
   * fecha o período de quem gastou.
   */
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
      } catch {
        /* silencioso */
      }
    };
    loadCartoes();
  }, [open, motoristaId]);

  /**
   * Aplica as escolhas do dropdown, um tipo de cada vez, pelas RPC.
   *
   * Antes eram dois `update` directos em `cartoes_frota`. Isso mudava o titular
   * sem abrir nem fechar o período em `cartao_atribuicoes` — que é o que decide
   * a quem se imputa o combustível — e sem tocar no estado nem nas datas. O
   * cartão mudava de mãos no ecrã e o consumo continuava a ser imputado a quem
   * já o tinha devolvido.
   *
   * Devolve os erros em vez de os atirar: gravar o motorista já correu bem
   * nesta altura, e falhar o save inteiro por causa de um cartão seria pior.
   * Mas deixam de ser engolidos — quem chama mostra-os.
   */
  const syncCartoes = async (novoMotoristaId: string): Promise<string[]> => {
    const erros: string[] = [];

    for (const tipo of TIPOS) {
      const escolhido = selectedCartao[tipo];
      const anterior = atribuidoInicial.current[tipo];
      if (escolhido === anterior) continue;

      try {
        // Devolver primeiro: é o que fecha o período do titular anterior e o
        // que liberta o cartão para poder ser atribuído a seguir.
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
