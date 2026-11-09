import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { CanalEnvio } from '@/components/administrativo/envioResumos';

export interface EstadoEnvio {
  enviadoEm: string;
  canais: CanalEnvio[];
}

export interface ContactoMotorista {
  telefone: string | null;
  email: string | null;
}

interface LinhaEnvio {
  motorista_id: string;
  enviado_em: string | null;
  enviado_canais: CanalEnvio[] | null;
}

// enviado_em / enviado_canais e a RPC vêm da migração 20261109120000; os tipos
// gerados ainda não os têm, daí o cliente sem tipos só aqui.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (f: string, args: Record<string, unknown>) => any;
};

export function useResumosEnviados(semanaInicio: string) {
  return useQuery({
    queryKey: ['resumos-enviados', { semanaInicio }],
    queryFn: async (): Promise<Map<string, EstadoEnvio>> => {
      const { data, error } = await db
        .from('motorista_liquido_semanal')
        .select('motorista_id, enviado_em, enviado_canais')
        .eq('semana_inicio', semanaInicio)
        .not('enviado_em', 'is', null);
      if (error) throw error;
      return new Map(
        ((data ?? []) as LinhaEnvio[]).map((l) => [
          l.motorista_id,
          { enviadoEm: l.enviado_em as string, canais: l.enviado_canais ?? [] },
        ])
      );
    },
  });
}

export function useContactosMotoristas(motoristaIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ['motoristas-contactos', { ids: [...motoristaIds].sort() }],
    enabled: enabled && motoristaIds.length > 0,
    queryFn: async (): Promise<Map<string, ContactoMotorista>> => {
      const { data, error } = await supabase
        .from('motoristas_ativos')
        .select('id, telefone, email')
        .in('id', motoristaIds);
      if (error) throw error;
      return new Map((data ?? []).map((m) => [m.id, { telefone: m.telefone, email: m.email }]));
    },
  });
}

interface MarcarEnviadosInput {
  motoristaIds: string[];
  semanaInicio: string;
  canal: CanalEnvio;
}

export async function marcarResumosEnviados({
  motoristaIds,
  semanaInicio,
  canal,
}: MarcarEnviadosInput): Promise<number> {
  const { data, error } = await db.rpc('marcar_resumos_enviados', {
    p_motorista_ids: motoristaIds,
    p_semana_inicio: semanaInicio,
    p_canal: canal,
  });
  if (error) throw error;
  return Number(data) || 0;
}

export function useMarcarResumosEnviados() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: marcarResumosEnviados,
    onSuccess: (_n, { semanaInicio }) => {
      qc.invalidateQueries({ queryKey: ['resumos-enviados', { semanaInicio }] });
    },
    onError: (error: unknown) => {
      // O erro do Postgres não é um Error: ler a mensagem directamente.
      const msg = (error as { message?: string } | null)?.message || 'Erro inesperado';
      toast.error('Não foi possível marcar como enviado: ' + msg);
    },
  });
}

export interface FalhaEnvioEmail {
  motoristaId: string;
  nome: string;
  motivo: string;
}

export interface ResultadoEnvioEmail {
  enviados: number;
  semEmail: FalhaEnvioEmail[];
  falhados: FalhaEnvioEmail[];
}

export async function enviarResumosEmail(input: {
  motoristaIds: string[];
  semanaInicio: string;
}): Promise<ResultadoEnvioEmail> {
  const { data, error } = await supabase.functions.invoke<ResultadoEnvioEmail>(
    'enviar-resumos-email',
    { body: input }
  );
  if (error) {
    // A razão real vem no corpo da resposta, não em error.message.
    let mensagem = error.message || 'Falha ao contactar o serviço de e-mail';
    try {
      const body = await (error as { context?: Response }).context?.json?.();
      mensagem = body?.error || mensagem;
    } catch {
      // corpo não é JSON: fica a mensagem genérica
    }
    throw new Error(mensagem);
  }
  return data ?? { enviados: 0, semEmail: [], falhados: [] };
}

export function useEnviarResumosEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: enviarResumosEmail,
    onSuccess: (r, { semanaInicio }) => {
      qc.invalidateQueries({ queryKey: ['resumos-enviados', { semanaInicio }] });
      const problemas = r.falhados.length + r.semEmail.length;
      if (problemas === 0) toast.success(`${r.enviados} e-mails enviados`);
      else toast.warning(`${r.enviados} e-mails enviados, ${problemas} por enviar`);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Erro inesperado';
      toast.error('Não foi possível enviar os e-mails: ' + msg);
    },
  });
}
