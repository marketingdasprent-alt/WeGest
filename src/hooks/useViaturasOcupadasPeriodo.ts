// Viaturas ocupadas NUM PERÍODO concreto (sobreposição de datas), para filtrar
// o seletor de viaturas ao criar/editar uma reserva ou contrato — de modo a que
// uma viatura já reservada/contratada nessas datas NÃO apareça disponível para
// outro cliente.
//
// Duas faixas [a_ini, a_fim) e [b_ini, b_fim) sobrepõem-se sse:
//   a_ini < b_fim  E  b_ini < a_fim
// Faixas sem fim (slot/contrato aberto, data_fim NULL) tratam-se como [ini, ∞):
//   um registo sem fim sobrepõe-se sempre que começa antes do fim pedido; e um
//   PEDIDO sem fim sobrepõe-se a qualquer registo que termine depois do início
//   pedido (ou que também não tenha fim).
//
// Fontes consideradas (as mesmas que ocupam uma viatura no renting):
//   - reservas: estado em ('pendente','confirmada','em_curso'), não soft-deleted
//   - contratos_renting: estado_operacional em ('agendado','em_curso'), não soft-deleted
//     e substituido_em IS NULL (uma versão substituída por troca de viatura
//     nunca muda de estado_operacional — sem este filtro, a viatura trocada
//     ficava presa como "ocupada" para sempre, mesmo já disponível)
//
// Nota: o overbooking JÁ é bloqueado ao gravar (constraints/RPC na BD). Este hook
// é a camada de UX que esconde as viaturas em conflito ANTES de o utilizador as
// escolher. Não substitui a validação de gravação.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface UseViaturasOcupadasPeriodoArgs {
  /** Início do período pretendido (ISO). */
  dataInicio: string | Date | null | undefined;
  /** Fim do período pretendido (ISO). NULL/aberto = a partir de dataInicio sem fim. */
  dataFim: string | Date | null | undefined;
  /** Reserva/contrato a ignorar (em edição, não conflitar consigo próprio). */
  excluirReservaId?: string | null;
  excluirContratoId?: string | null;
  enabled?: boolean;
}

const toIso = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  const d = typeof v === 'string' ? new Date(v) : v;
  return isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * Devolve o conjunto de `viatura_id` ocupadas (reserva ou contrato sobreposto)
 * no período [dataInicio, dataFim). Vazio enquanto não houver datas válidas.
 */
export function useViaturasOcupadasPeriodo(args: UseViaturasOcupadasPeriodoArgs) {
  const { dataInicio, dataFim, excluirReservaId, excluirContratoId, enabled = true } = args;

  const iniIso = toIso(dataInicio);
  // Pedido SEM data de fim = período aberto [início, ∞) (regime slot/aberto):
  // não há limite superior — a sobreposição é decidida só pelo início. NÃO se
  // colapsa o fim no início (isso deixava escapar registos que começam em/depois
  // do início pedido). `fimPedidoIso` fica null e a query não aplica limite cimo.
  const fimPedidoIso = toIso(dataFim);

  // Basta haver início válido (o fim pode ser aberto).
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

      // Sobreposição: o registo começa antes do fim pedido (se houver fim) E
      // (não tem fim OU termina depois do início pedido). Com pedido aberto, o
      // limite superior não se aplica — só conta o `cobreInicio`.
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

      // Falha-para-seguro: se uma query falhar, propagar o erro (não devolver
      // "tudo livre", o que esconderia conflitos reais).
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
