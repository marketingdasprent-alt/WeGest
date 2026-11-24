import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { mensagemDeErroDaFuncao } from '@/lib/erroFuncaoEdge';
import type { EstadoAcessoRow } from '@/components/motoristas/tabs/dados/estadoAcesso';

export type ResultadoEnvioAcesso =
  | { status: 'enviado'; emailMascarado: string }
  | { status: 'requer_confirmacao'; mensagem: string };

interface EnviarAcessoInput {
  motoristaId: string;
  confirmarSubstituicao?: boolean;
}

export function useEstadoAcessoMotorista(motoristaId: string | null | undefined) {
  return useQuery({
    queryKey: ['motorista-acesso', motoristaId ?? null],
    enabled: !!motoristaId,
    queryFn: async (): Promise<EstadoAcessoRow | null> => {
      // RPC da migração 20261125100000; types.ts é regenerado depois de aplicada.
      const { data, error } = await supabase.rpc(
        'motorista_estado_acesso' as never,
        { p_motorista_id: motoristaId } as never
      );
      if (error) throw error;
      const linhas = (data ?? []) as unknown as EstadoAcessoRow[];
      return linhas[0] ?? null;
    },
  });
}

interface CorpoErro {
  error?: string;
  mensagem?: string;
}

async function lerCorpoErro(error: unknown): Promise<CorpoErro | null> {
  const contexto = (error as { context?: unknown } | null)?.context;
  if (!(contexto instanceof Response) || contexto.status === 429) return null;
  try {
    return (await contexto.clone().json()) as CorpoErro;
  } catch {
    return null;
  }
}

const FALLBACK = 'Não foi possível enviar o acesso.';

export function useEnviarAcessoMotorista() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const orgId = useOrgId();

  return useMutation({
    mutationFn: async ({
      motoristaId,
      confirmarSubstituicao,
    }: EnviarAcessoInput): Promise<ResultadoEnvioAcesso> => {
      // Nunca vai email nem senha: o servidor decide o destino e gera a senha.
      const { data, error } = await supabase.functions.invoke('motorista-enviar-acesso', {
        body: {
          motorista_id: motoristaId,
          org_id: orgId,
          ...(confirmarSubstituicao ? { confirmar_substituicao: true } : {}),
        },
      });
      if (error) {
        const corpo = await lerCorpoErro(error);
        if (corpo?.error === 'requer_confirmacao') {
          return { status: 'requer_confirmacao', mensagem: corpo.mensagem ?? '' };
        }
        throw new Error(corpo?.mensagem || (await mensagemDeErroDaFuncao(error, FALLBACK)));
      }
      const r = data as { success?: boolean; email_destino_mascarado?: string } | null;
      if (!r?.success) throw new Error(FALLBACK);
      return { status: 'enviado', emailMascarado: r.email_destino_mascarado ?? '' };
    },
    onSuccess: (resultado) => {
      if (resultado.status !== 'enviado') return;
      void qc.invalidateQueries({ queryKey: ['motorista-acesso'] });
      toast({ title: `Acesso enviado para ${resultado.emailMascarado}` });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Erro inesperado';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });
}
