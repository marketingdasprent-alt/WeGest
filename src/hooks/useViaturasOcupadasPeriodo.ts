import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface UseViaturasOcupadasPeriodoArgs {
  dataInicio: string | Date | null | undefined;

  dataFim: string | Date | null | undefined;

  excluirReservaId?: string | null;
  excluirContratoId?: string | null;
  enabled?: boolean;
}

const toIso = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  const d = typeof v === 'string' ? new Date(v) : v;
  return isNaN(d.getTime()) ? null : d.toISOString();
};

export function useViaturasOcupadasPeriodo(args: UseViaturasOcupadasPeriodoArgs) {
  const { dataInicio, dataFim, excluirReservaId, excluirContratoId, enabled = true } = args;

  const iniIso = toIso(dataInicio);

  const fimPedidoIso = toIso(dataFim);

  const queryEnabled = enabled && !!iniIso;

  return useQuery({
    queryKey: [
      'viaturas-ocupadas-periodo',
      iniIso,
      fimPedidoIso,
      excluirReservaId ?? null,
      excluirContratoId ?? null,
    ],
    enabled: queryEnabled,
    staleTime: 10_000,
    queryFn: async (): Promise<Set<string>> => {
      const ocupadas = new Set<string>();
      if (!iniIso) return ocupadas;

      let reservasQuery = supabase
        .from('reservas')
        .select('viatura_id, data_inicio, data_fim, id')
        .is('deleted_at', null)
        .not('viatura_id', 'is', null)
        .in('estado', ['pendente', 'confirmada', 'em_curso']);
      let contratosQuery = supabase
        .from('contratos_renting')
        .select('viatura_id, data_inicio, data_fim, id')
        .is('deleted_at', null)

        .is('substituido_em', null)
        .not('viatura_id', 'is', null)
        .in('estado_operacional', ['agendado', 'em_curso']);
      if (fimPedidoIso) {
        reservasQuery = reservasQuery.lt('data_inicio', fimPedidoIso);
        contratosQuery = contratosQuery.lt('data_inicio', fimPedidoIso);
      }

      const [reservasRes, contratosRes] = await Promise.all([reservasQuery, contratosQuery]);

      if (reservasRes.error) throw reservasRes.error;
      if (contratosRes.error) throw contratosRes.error;

      const iniMs = new Date(iniIso).getTime();
      const cobreInicio = (dataFimRegisto: string | null) =>
        dataFimRegisto === null || new Date(dataFimRegisto).getTime() > iniMs;

      (reservasRes.data ?? []).forEach((r: any) => {
        if (r.id === excluirReservaId) return;
        if (r.viatura_id && cobreInicio(r.data_fim)) ocupadas.add(r.viatura_id);
      });
      (contratosRes.data ?? []).forEach((c: any) => {
        if (c.id === excluirContratoId) return;
        if (c.viatura_id && cobreInicio(c.data_fim)) ocupadas.add(c.viatura_id);
      });

      return ocupadas;
    },
  });
}
