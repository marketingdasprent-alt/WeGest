import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const ESTADOS_ABERTO = ['pendente', 'aberto', 'em_andamento', 'aguardando'];

export interface AssistenciaInicioKpis {
  porResolver: number;
  naoAtribuidos: number;
  atribuidosAMim: number;
  resolvidosHoje: number;
}

export interface CategoriaResumo {
  id: string;
  nome: string;
  cor: string;
  icone: string;
  contagem: number;
}

const KPIS_VAZIO: AssistenciaInicioKpis = {
  porResolver: 0,
  naoAtribuidos: 0,
  atribuidosAMim: 0,
  resolvidosHoje: 0,
};

/** KPIs e distribuição por categoria para o ecrã "Início" da dashboard de Assistência. */
export function useAssistenciaInicioResumo(userId: string | null | undefined) {
  const [kpis, setKpis] = useState<AssistenciaInicioKpis>(KPIS_VAZIO);
  const [categorias, setCategorias] = useState<CategoriaResumo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      const hojeInicio = new Date();
      hojeInicio.setHours(0, 0, 0, 0);
      const hojeFim = new Date();
      hojeFim.setHours(23, 59, 59, 999);

      const [{ data: tickets }, { data: categoriasData }] = await Promise.all([
        supabase
          .from('assistencia_tickets')
          .select('id, status, atribuido_a, categoria_id, data_resolucao'),
        supabase
          .from('assistencia_categorias')
          .select('id, nome, cor, icone')
          .eq('ativo', true)
          .order('ordem', { ascending: true }),
      ]);
      if (cancelado) return;

      const todosTickets = tickets ?? [];
      const abertos = todosTickets.filter((t) => ESTADOS_ABERTO.includes(t.status));

      const kpisCalculados: AssistenciaInicioKpis = {
        porResolver: abertos.length,
        naoAtribuidos: abertos.filter((t) => !t.atribuido_a).length,
        atribuidosAMim: userId ? abertos.filter((t) => t.atribuido_a === userId).length : 0,
        resolvidosHoje: todosTickets.filter(
          (t) =>
            t.data_resolucao &&
            new Date(t.data_resolucao) >= hojeInicio &&
            new Date(t.data_resolucao) <= hojeFim
        ).length,
      };

      const contagemPorCategoria = new Map<string, number>();
      abertos.forEach((t) => {
        if (!t.categoria_id) return;
        contagemPorCategoria.set(t.categoria_id, (contagemPorCategoria.get(t.categoria_id) ?? 0) + 1);
      });

      const categoriasComContagem = (categoriasData ?? []).map((c) => ({
        id: c.id,
        nome: c.nome,
        cor: c.cor ?? '#3B82F6',
        icone: c.icone ?? 'wrench',
        contagem: contagemPorCategoria.get(c.id) ?? 0,
      }));

      setKpis(kpisCalculados);
      setCategorias(categoriasComContagem);
      setLoading(false);
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [userId]);

  return { kpis, categorias, loading };
}
