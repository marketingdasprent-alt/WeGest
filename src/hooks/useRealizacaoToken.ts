import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TokenRealizacaoInfo {
  evento_id: string;
  contrato_id: string;
  tipo: 'entrega' | 'recolha';
  matricula: string;
  cidade: string | null;
  data_inicio: string;
}

/** Cria token de deep-link para um evento de calendário. */
export function useGerarTokenRealizacao() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (eventoId: string): Promise<string> => {
      const { data, error } = await supabase.rpc('gerar_token_realizacao', {
        p_evento_id: eventoId,
      });
      if (error) throw error;
      return data as string;
    },
    onError: (err: unknown) => {
      toast({
        title: 'Erro ao gerar QR',
        description: err instanceof Error ? err.message : 'Erro inesperado',
        variant: 'destructive',
      });
    },
  });
}

/** Carrega os dados associados a um token (página /check-out/:token). */
export function useConsumirTokenRealizacao(token: string | null) {
  return useQuery({
    queryKey: ['realizacao-token', token],
    queryFn: async (): Promise<TokenRealizacaoInfo | null> => {
      if (!token) return null;
      const { data, error } = await supabase.rpc('consumir_token_realizacao', {
        p_token: token,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return row as TokenRealizacaoInfo;
    },
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * Polling do evento — usado pelo laptop enquanto espera que o
 * telemóvel realize. Devolve o `realizado_em` quando aparece.
 */
export function usePollEventoRealizado(eventoId: string | null, enabled = true) {
  const [realizado, setRealizado] = useState<{
    em: string;
    por_id: string | null;
  } | null>(null);

  useEffect(() => {
    if (!eventoId || !enabled) return;
    setRealizado(null);
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      const { data, error } = await supabase
        .from('calendario_eventos')
        .select('realizado_em, realizado_por_id')
        .eq('id', eventoId)
        .maybeSingle();
      if (error || !data || cancelled) return;
      // Realizado = o evento existe e tem realizado_em. Desde a migração
      // 20260601000018 a realização (entrega/recolha) MARCA o evento como
      // realizado e mantém-no (já não é apagado). Evento inexistente significa
      // outra coisa (ex.: contrato cancelado) — NÃO é realização, por isso não
      // confirmamos com base na ausência (evitava falsos "confirmado").
      if (data.realizado_em) {
        setRealizado({
          em: data.realizado_em as string,
          por_id: (data.realizado_por_id as string | null) ?? null,
        });
      }
    };

    check();
    const interval = setInterval(check, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [eventoId, enabled]);

  return realizado;
}

interface RealizarFromTokenArgs {
  token: string;
  eventoId: string;
  contratoId: string;
  tipo: 'entrega' | 'recolha';
}

/**
 * Confirma a realização no telemóvel: muda o estado_operacional do
 * contrato (trigger marca o evento como realizado) + marca o token
 * como usado.
 */
export function useRealizarFromToken() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ token }: RealizarFromTokenArgs): Promise<void> => {
      // RPC atómico: muda o estado do contrato (dispara a cascata que marca
      // o evento realizado) + marca o token usado, na mesma transação.
      const { error } = await supabase.rpc('realizar_token_realizacao', { p_token: token });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      // NOTA: NÃO invalidar a query do token aqui — o refetch dispara o
      // RPC consumir_token_realizacao, que dá erro "token já usado" e
      // a página entraria no estado de erro em vez do "Confirmada".
      qc.invalidateQueries({ queryKey: ['calendario-eventos'] });
      qc.invalidateQueries({ queryKey: ['renting', 'contratos'] });
      qc.invalidateQueries({ queryKey: ['calendario', 'eventos-pendentes-renting'] });
      // A box "pendente" do contrato lê desta query — sem isto, ao voltar ao
      // contrato a box continuava a aparecer apesar de já estar realizado.
      qc.invalidateQueries({ queryKey: ['calendario-evento-pendente'] });
      toast({
        title: vars.tipo === 'entrega' ? 'Entrega confirmada' : 'Recolha confirmada',
        description: 'O evento ficou marcado como realizado.',
      });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Erro ao confirmar',
        description: err instanceof Error ? err.message : 'Erro inesperado',
        variant: 'destructive',
      });
    },
  });
}
