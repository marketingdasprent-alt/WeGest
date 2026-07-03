import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dataUrlToBlob } from '@/utils/dataUrl';
import type { PapelAssinatura } from '@/utils/assinaturasHandover';

const BUCKET = 'contrato-media';

export interface GuardarAssinaturasParams {
  eventoId: string | null;
  contratoId: string | null;
  orgId: string | null;
  assinadoPorId: string;
  motoristaNome: string;
  motoristaId?: string | null;
  responsavelNome: string;
  sigMotorista: string | null;
  sigResponsavel: string | null;
}

export interface AssinaturaHandoverRow {
  id: string;
  papel: PapelAssinatura;
  signatario_nome: string;
  storage_path: string;
  assinado_em: string;
}

interface UploadOne {
  papel: PapelAssinatura;
  dataUrl: string;
  signatarioNome: string;
  signatarioId: string | null;
}

async function guardarUma(p: GuardarAssinaturasParams, item: UploadOne): Promise<void> {
  const blob = dataUrlToBlob(item.dataUrl);
  const stamp = `${p.eventoId ?? 'sem-evento'}/${item.papel}_${Date.now()}.png`;
  const path = `assinaturas/${stamp}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/png', upsert: false });
  if (upErr) throw upErr;

  const { error: insErr } = await supabase.from('assinaturas_handover').insert({
    org_id: p.orgId ?? undefined,
    calendario_evento_id: p.eventoId,
    contrato_id: p.contratoId,
    papel: item.papel,
    signatario_nome: item.signatarioNome,
    signatario_id: item.signatarioId,
    storage_path: path,
    assinado_por_id: p.assinadoPorId,
  });
  if (insErr) throw insErr;
}

/**
 * Guarda as assinaturas de handover (motorista e/ou responsável). Faz upload
 * do PNG para `contrato-media` e regista a linha de auditoria. Só processa os
 * papéis que têm assinatura (data URL não vazio).
 */
export function useGuardarAssinaturasHandover() {
  const qc = useQueryClient();
  return useMutation<void, unknown, GuardarAssinaturasParams>({
    mutationFn: async (p) => {
      const itens: UploadOne[] = [];
      if (p.sigMotorista) {
        itens.push({
          papel: 'motorista',
          dataUrl: p.sigMotorista,
          signatarioNome: p.motoristaNome,
          signatarioId: p.motoristaId ?? null,
        });
      }
      if (p.sigResponsavel) {
        itens.push({
          papel: 'responsavel',
          dataUrl: p.sigResponsavel,
          signatarioNome: p.responsavelNome,
          signatarioId: p.assinadoPorId,
        });
      }
      for (const item of itens) {
        await guardarUma(p, item);
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['assinaturas-handover', vars.contratoId] });
    },
  });
}

export function useAssinaturasHandover(contratoId: string | null | undefined) {
  return useQuery({
    queryKey: ['assinaturas-handover', contratoId ?? null],
    enabled: !!contratoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assinaturas_handover')
        .select('id, papel, signatario_nome, storage_path, assinado_em')
        .eq('contrato_id', contratoId as string)
        .order('assinado_em', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AssinaturaHandoverRow[];
    },
  });
}
