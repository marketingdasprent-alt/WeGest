import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import {
  documentosAExpirar,
  semanasSemRecibo,
  type DocAExpirar,
  type SemanaEmFalta,
} from '@/components/motorista-portal/dashboardStats';
import type { MotoristaAtivo } from '@/hooks/useMotoristaAtivo';

export interface ReciboEmValidacao {
  id: string;
  descricao: string;
  criadoEm: string | null;
  valor: number;
  url: string;
  nome: string | null;
}

export interface DashboardStats {
  saldoPendente: number;
  recibosEmValidacao: ReciboEmValidacao[];
  semanasEmFalta: SemanaEmFalta[];
  docsExpirando: DocAExpirar[];
}

interface Options {
  /** `recibo_verde !== false`. Quem não passa recibos não tem recibos em falta — nem se pergunta. */
  usaRecibos: boolean;
}

const QUERY_KEY = 'motorista-dashboard-stats';

/**
 * Os números do Início do painel: saldo, recibos e documentos a expirar.
 *
 * O saldo vem da RPC `motorista_saldo_pendente`, a mesma que o backoffice e
 * o resumo semanal usam — nunca recalculado à mão aqui. Recibos e financeiro
 * mudam do lado do gestor enquanto o motorista tem a app aberta, por isso
 * há uma subscrição realtime que invalida a query.
 */
export function useMotoristaDashboardStats(
  motorista: MotoristaAtivo | null | undefined,
  { usaRecibos }: Options
) {
  const qc = useQueryClient();
  const id = motorista?.id;

  useEffect(() => {
    if (!id) return;
    const invalidar = () => qc.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    const canal = supabase
      .channel(`dashboard-motorista-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'motorista_recibos',
          filter: `motorista_id=eq.${id}`,
        },
        invalidar
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'motorista_financeiro',
          filter: `motorista_id=eq.${id}`,
        },
        invalidar
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [id, qc]);

  return useQuery({
    queryKey: [QUERY_KEY, id, { usaRecibos }],
    enabled: !!id && !!motorista,
    queryFn: async (): Promise<DashboardStats> => {
      const m = motorista!;

      const saldo = await supabase.rpc('motorista_saldo_pendente', { p_motorista_id: m.id });
      if (saldo.error) throw saldo.error;

      if (!usaRecibos) {
        return {
          saldoPendente: Number(saldo.data) || 0,
          recibosEmValidacao: [],
          semanasEmFalta: [],
          docsExpirando: documentosAExpirar(m),
        };
      }

      const [pendentes, todos] = await Promise.all([
        supabase
          .from('motorista_recibos')
          .select('id, descricao, created_at, valor_total, ficheiro_url, nome_ficheiro')
          .eq('motorista_id', m.id)
          .eq('tipo', 'recibo')
          .eq('status', 'submetido'),
        supabase
          .from('motorista_recibos')
          .select('semana_referencia_inicio')
          .eq('motorista_id', m.id)
          .eq('tipo', 'recibo'),
      ]);
      if (pendentes.error) throw pendentes.error;
      if (todos.error) throw todos.error;

      const semanasComRecibo = new Set(
        (todos.data ?? []).map((r) => r.semana_referencia_inicio).filter((s): s is string => !!s)
      );

      return {
        saldoPendente: Number(saldo.data) || 0,
        recibosEmValidacao: (pendentes.data ?? []).map((r) => ({
          id: r.id,
          descricao: r.descricao,
          criadoEm: r.created_at,
          valor: Number(r.valor_total) || 0,
          url: r.ficheiro_url,
          nome: r.nome_ficheiro,
        })),
        semanasEmFalta: semanasSemRecibo(m.data_contratacao, semanasComRecibo),
        docsExpirando: documentosAExpirar(m),
      };
    },
  });
}
