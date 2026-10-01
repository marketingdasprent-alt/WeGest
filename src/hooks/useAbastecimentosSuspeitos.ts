import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

import { supabase } from '@/integrations/supabase/client';
import {
  abastecimentosSuspeitos,
  type AssociacaoViatura,
  type TransacaoCombustivel,
} from '@/utils/abastecimentosSuspeitos';

const CAMPO_MATRICULA = 'MATRÍCULA/CONDUTOR TICKET';

interface LinhaRepsol {
  id: string;
  transaction_date: string;
  amount: number | null;
  motorista_id: string | null;
  viatura_id: string | null;
  raw_data: Record<string, unknown> | null;
}

/**
 * Abastecimentos Repsol da semana imputados a um motorista mas feitos num carro
 * que estava com outro. Só a Repsol traz a matrícula escrita na bomba.
 */
export function useAbastecimentosSuspeitos(inicio: Date, fim: Date, enabled = true) {
  const de = format(inicio, 'yyyy-MM-dd');
  const ate = format(fim, 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['abastecimentos-suspeitos', { de, ate }],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // A hora da bomba é local gravada como UTC: o dia inteiro é T00:00Z–T23:59Z.
      const { data: tx, error } = await supabase
        .from('repsol_transacoes')
        .select('id, transaction_date, amount, motorista_id, viatura_id, raw_data')
        .gte('transaction_date', `${de}T00:00:00Z`)
        .lte('transaction_date', `${ate}T23:59:59Z`)
        .not('motorista_id', 'is', null);
      if (error) throw error;
      const linhas = (tx ?? []) as unknown as LinhaRepsol[];
      if (linhas.length === 0) return { suspeitos: [], nomes: {} as Record<string, string> };

      const [viaturas, associacoes] = await Promise.all([
        supabase.from('viaturas').select('id, matricula'),
        supabase
          .from('motorista_viaturas')
          .select('viatura_id, motorista_id, data_inicio, data_fim')
          .lte('data_inicio', ate)
          .or(`data_fim.is.null,data_fim.gte.${de}`),
      ]);
      if (viaturas.error) throw viaturas.error;
      if (associacoes.error) throw associacoes.error;

      const transacoes: TransacaoCombustivel[] = linhas.map((l) => ({
        id: l.id,
        data: l.transaction_date,
        valor: Number(l.amount) || 0,
        motoristaId: l.motorista_id,
        matriculaBomba: (l.raw_data?.[CAMPO_MATRICULA] as string | undefined) ?? null,
        viaturaId: l.viatura_id,
      }));
      const assoc: AssociacaoViatura[] = (associacoes.data ?? []).map((a) => ({
        viaturaId: a.viatura_id,
        motoristaId: a.motorista_id,
        inicio: a.data_inicio,
        fim: a.data_fim,
      }));
      const suspeitos = abastecimentosSuspeitos(
        transacoes,
        (viaturas.data ?? []).filter((v): v is { id: string; matricula: string } => !!v.matricula),
        assoc
      );

      const ids = [...new Set(suspeitos.flatMap((s) => [s.imputadoId, ...s.titularesIds]))];
      let nomes: Record<string, string> = {};
      if (ids.length) {
        const { data: ms, error: erroNomes } = await supabase
          .from('motoristas_ativos')
          .select('id, nome')
          .in('id', ids);
        if (erroNomes) throw erroNomes;
        nomes = Object.fromEntries((ms ?? []).map((m) => [m.id, m.nome?.trim() || 'Sem nome']));
      }
      return { suspeitos, nomes };
    },
  });
}
