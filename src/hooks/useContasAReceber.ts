import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Cobrança emitida com saldo por liquidar há mais de este nº de dias. */
export const DIAS_EM_ABERTO_ALERTA = 30;

export interface CobrancaEmitida {
  id: string;
  valor_total: number | null;
  emitida_em: string | null;
  destinatario_nome: string;
  contrato_id: string | null;
}

export interface CobrancaEmAberto {
  id: string;
  destinatarioNome: string;
  contratoId: string | null;
  saldo: number;
  diasEmAberto: number;
}

export interface ContasAReceber {
  /** Soma do saldo por liquidar de todas as cobranças emitidas (valor_total - pago - creditado). */
  totalAReceber: number;
  /** Cobranças emitidas há mais de 30 dias e ainda com saldo por liquidar, da mais antiga para a mais recente. */
  emAberto: CobrancaEmAberto[];
}

/**
 * Reconciliação pura (testável sem BD) — mesma leitura de `estadoCobranca.ts`:
 * uma cobrança pode continuar `emitida` mesmo parcial ou totalmente
 * creditada, por isso o saldo real é sempre valor_total - recibos activos -
 * notas de crédito activas, nunca o `estado` sozinho. Mesma reconciliação já
 * usada em FaturacaoTab.tsx (resolverCobranca), só que agregada em vez de
 * por linha.
 */
export function calcularContasAReceber(
  cobrancas: CobrancaEmitida[],
  recibosPorCobranca: Map<string, number>,
  creditadoPorCobranca: Map<string, number>,
  agora: Date = new Date()
): ContasAReceber {
  let totalAReceber = 0;
  const emAberto: CobrancaEmAberto[] = [];

  for (const c of cobrancas) {
    const total = Number(c.valor_total) || 0;
    const pago = recibosPorCobranca.get(c.id) ?? 0;
    const creditado = creditadoPorCobranca.get(c.id) ?? 0;
    const saldo = Math.round((total - pago - creditado) * 100) / 100;
    if (saldo <= 0.005) continue; // liquidada (paga e/ou creditada por completo)

    totalAReceber += saldo;

    const diasEmAberto = c.emitida_em
      ? Math.floor((agora.getTime() - new Date(c.emitida_em).getTime()) / 86_400_000)
      : 0;
    if (diasEmAberto > DIAS_EM_ABERTO_ALERTA) {
      emAberto.push({
        id: c.id,
        destinatarioNome: c.destinatario_nome,
        contratoId: c.contrato_id,
        saldo,
        diasEmAberto,
      });
    }
  }

  emAberto.sort((a, b) => b.diasEmAberto - a.diasEmAberto);

  return {
    totalAReceber: Math.round(totalAReceber * 100) / 100,
    emAberto,
  };
}

/** Agrupa um valor por chave, somando repetições (usado para recibos/notas de crédito por cobrança). */
function somarPorChave<T>(rows: T[], chave: (row: T) => string | null, valor: (row: T) => number) {
  const mapa = new Map<string, number>();
  rows.forEach((row) => {
    const k = chave(row);
    if (!k) return;
    mapa.set(k, (mapa.get(k) ?? 0) + valor(row));
  });
  return mapa;
}

export function useContasAReceber() {
  return useQuery({
    queryKey: ['contas-a-receber'],
    queryFn: async (): Promise<ContasAReceber> => {
      const { data: cobrancas, error: cobrancasError } = await supabase
        .from('contrato_cobrancas')
        .select('id, valor_total, emitida_em, destinatario_nome, contrato_id')
        .eq('estado', 'emitida');
      if (cobrancasError) throw cobrancasError;
      if (!cobrancas || cobrancas.length === 0) {
        return { totalAReceber: 0, emAberto: [] };
      }

      const ids = cobrancas.map((c) => c.id);
      const [{ data: recibos, error: recibosError }, { data: notasCredito, error: ncError }] =
        await Promise.all([
          supabase
            .from('recibos')
            .select('referencia, valor')
            .in('referencia', ids)
            .eq('estado', 'ativo'),
          supabase
            .from('notas_credito')
            .select('cobranca_id, valor')
            .in('cobranca_id', ids)
            .eq('estado', 'ativo'),
        ]);
      if (recibosError) throw recibosError;
      if (ncError) throw ncError;

      const pagoPorCobranca = somarPorChave(
        recibos ?? [],
        (r) => r.referencia,
        (r) => Number(r.valor)
      );
      const creditadoPorCobranca = somarPorChave(
        notasCredito ?? [],
        (n) => n.cobranca_id,
        (n) => Number(n.valor)
      );

      return calcularContasAReceber(cobrancas, pagoPorCobranca, creditadoPorCobranca);
    },
  });
}
