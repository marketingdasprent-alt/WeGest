import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ReceitasData } from '@/components/viaturas/tabs/ViaturaFinanceiraMovimentos';

// Quebra a cadeia de inferência de tipos do Supabase para queries com .select('*')
// em tabelas com muitas colunas (evita TS2589 "Type instantiation is excessively deep").
type SimpleQueryBuilder = {
  select: (cols: string) => {
    in: (col: string, vals: string[]) => Promise<{
      data: Record<string, unknown>[] | null;
      error: unknown;
    }>;
  };
};
const db = supabase as unknown as { from: (t: string) => SimpleQueryBuilder };

function getTrimestreDataRange() {
  const now = new Date();
  const month = now.getMonth();
  let startMonth: number;
  let year: number;

  if (month < 3) {
    startMonth = 0;
    year = now.getFullYear();
  } else if (month < 6) {
    startMonth = 3;
    year = now.getFullYear();
  } else if (month < 9) {
    startMonth = 6;
    year = now.getFullYear();
  } else {
    startMonth = 9;
    year = now.getFullYear();
  }

  const inicio = new Date(year, startMonth, 1);
  const fim = new Date(year, startMonth + 3, 0);
  return { inicio, fim };
}

export function useViaturaFinanceiraReceitas(viaturaId: string | undefined) {
  const [receitas, setReceitas] = useState<ReceitasData>({
    contratos: 0,
    portagens: 0,
    combustivel: 0,
    danos: 0,
    outros: 0,
    reembolsos: 0,
    loading: true,
  });

  const loadReceitas = useCallback(async () => {
    if (!viaturaId) return;
    setReceitas((prev) => ({ ...prev, loading: true }));

    try {
      const { inicio, fim } = getTrimestreDataRange();

      // A. Associações da viatura a motoristas no trimestre
      const { data: associacoes } = await supabase
        .from('motorista_viaturas')
        .select('id, motorista_id, data_inicio, data_fim')
        .eq('viatura_id', viaturaId);

      if (!associacoes || associacoes.length === 0) {
        setReceitas({ contratos: 0, portagens: 0, combustivel: 0, danos: 0, outros: 0, reembolsos: 0, loading: false });
        return;
      }

      // Recolher motoristas únicos
      const motoristaIds = [...new Set(associacoes.map((a) => a.motorista_id))];

      // B. Financeiro dos contratos (em paralelo)
      const [finRes, contratosRes, boltRes, bpRes, repsolRes, edpRes] = await Promise.all([
        db.from('financeiro').select('*').in('motorista_id', motoristaIds),
        db.from('contratos').select('*').in('motorista_id', motoristaIds),
        db.from('bolt_portagens').select('*').in('motorista_id', motoristaIds),
        db.from('bp_fuel_transactions').select('*').in('motorista_id', motoristaIds),
        db.from('repsol_fuel').select('*').in('motorista_id', motoristaIds),
        db.from('edp_fuel').select('*').in('motorista_id', motoristaIds),
      ]);

      const finData = finRes.data || [];
      const contratosData = contratosRes.data || [];
      const boltData = boltRes.data || [];

      let totalContratos = 0;
      let totalOutros = 0;
      let totalPortagens = 0;
      let totalCombustivel = 0;
      let totalReembolsos = 0;

      for (const assoc of associacoes) {
        if (!assoc.data_inicio) continue;
        const aInicio = new Date(assoc.data_inicio + 'T00:00:00');
        const aFim = assoc.data_fim ? new Date(assoc.data_fim + 'T00:00:00') : new Date();

        // Período da associação dentro do trimestre
        const periodoInicio = aInicio > inicio ? aInicio : inicio;
        const periodoFim = aFim < fim ? aFim : fim;

        if (periodoInicio > periodoFim) continue;

        // Financeiro filtrado
        const finFiltrado = finData.filter((f: any) => {
          if (f.motorista_id !== assoc.motorista_id) return false;
          const d = new Date(f.data_movimento || f.created_at || '');
          return d >= periodoInicio && d <= periodoFim;
        });

        totalContratos += finFiltrado
          .filter((f: any) => f.categoria === 'renda_viatura')
          .reduce((acc: number, curr: any) => {
            const val = Number(curr.valor) || 0;
            return acc + (curr.tipo === 'debito' ? val : -val);
          }, 0);

        totalOutros += finFiltrado
          .filter((f: any) => f.categoria === 'outro')
          .reduce((acc: number, curr: any) => {
            const val = Number(curr.valor) || 0;
            return acc + (curr.tipo === 'debito' ? val : -val);
          }, 0);

        totalReembolsos += finFiltrado
          .filter((f: any) => f.tipo === 'credito')
          .reduce((acc: number, curr: any) => acc + (Number(curr.valor) || 0), 0);

        totalPortagens += (boltData || [])
          .filter((b: any) => {
            if (b.motorista_id !== assoc.motorista_id) return false;
            const pInicio = b.periodo_inicio ? new Date(b.periodo_inicio) : null;
            const pFim = b.periodo_fim ? new Date(b.periodo_fim) : null;
            if (!pInicio || !pFim) return false;
            return pInicio <= periodoFim && pFim >= periodoInicio;
          })
          .reduce((acc: number, curr: any) => acc + (Number(curr.portagens) || 0), 0);

        const fuelItems = [
          ...(bpRes.data || []),
          ...(repsolRes.data || []),
          ...(edpRes.data || []),
        ].filter((f: any) => {
          const d = new Date(f.transaction_date || f.data_movimento || '');
          return f.motorista_id === assoc.motorista_id && d >= periodoInicio && d <= periodoFim;
        });

        totalCombustivel += fuelItems.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
      }

      // Danos
      const { data: reparacoesData } = await supabase
        .from('viatura_reparacoes')
        .select('custo')
        .eq('viatura_id', viaturaId);

      const totalDanos = (reparacoesData || []).reduce(
        (acc: number, curr: any) => acc + (Number(curr.custo) || 0),
        0,
      );

      setReceitas({
        contratos: totalContratos,
        portagens: totalPortagens,
        combustivel: totalCombustivel,
        danos: totalDanos,
        outros: totalOutros,
        reembolsos: totalReembolsos,
        loading: false,
      });
    } catch (error) {
      console.error('Erro ao carregar receitas:', error);
      toast.error('Erro ao carregar dados de receitas.');
      setReceitas((prev) => ({ ...prev, loading: false }));
    }
  }, [viaturaId]);

  useEffect(() => {
    loadReceitas();
  }, [loadReceitas]);

  return { receitas, loadReceitas };
}
