import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/utils/errorMessage';
import type {
  DocumentoMotoristaPortal,
  FichaDocumentos,
  TipoDocumentoMotorista,
} from '@/utils/documentosMotorista';

const QUERY_KEY = 'motorista-documentos-portal';
const MAX_BYTES = 10 * 1024 * 1024;

const FICHA_COLS =
  'documento_ficheiro_url, documento_identificacao_verso_url, carta_ficheiro_url, ' +
  'carta_conducao_verso_url, licenca_tvde_ficheiro_url, registo_criminal_url, ' +
  'comprovativo_morada_url, comprovativo_iban_url, documento_validade, carta_validade, ' +
  'licenca_tvde_validade';

export interface DocumentosPortal {
  /** As colunas oficiais da ficha — o que vale hoje. */
  ficha: FichaDocumentos | null;
  /** Tudo o que o motorista enviou (pendente, aprovado, rejeitado), mais recente primeiro. */
  documentos: DocumentoMotoristaPortal[];
}

/** Documentos pessoais do motorista, para o cartão do portal. */
export function useDocumentosMotoristaPortal(motoristaId: string | null | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, motoristaId],
    enabled: !!motoristaId,
    queryFn: async (): Promise<DocumentosPortal> => {
      const [ficha, docs] = await Promise.all([
        supabase.from('motoristas_ativos').select(FICHA_COLS).eq('id', motoristaId!).maybeSingle(),
        supabase
          .from('motorista_documentos')
          .select(
            'id, tipo_documento, nome_ficheiro, ficheiro_url, data_validade, status, motivo_rejeicao, created_at'
          )
          .eq('motorista_id', motoristaId!)
          .order('created_at', { ascending: false }),
      ]);
      if (ficha.error) throw ficha.error;
      if (docs.error) throw docs.error;
      return {
        ficha: (ficha.data as FichaDocumentos | null) ?? null,
        documentos: (docs.data ?? []) as DocumentoMotoristaPortal[],
      };
    },
  });
}

export interface EnvioDocumento {
  tipo: TipoDocumentoMotorista;
  file: File;
  userId: string;
  /** Pendente do mesmo tipo ainda por rever: substitui-se em vez de criar outro. */
  substituir: { id: string; ficheiro_url: string } | null;
}

/**
 * O motorista envia um documento. Entra sempre como `pendente` — a RLS não
 * lhe deixa marcar outra coisa — e só chega à ficha quando um gestor aprovar.
 */
export function useEnviarDocumentoMotorista(motoristaId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ tipo, file, userId, substituir }: EnvioDocumento) => {
      if (file.size > MAX_BYTES) throw new Error('Ficheiro muito grande. Máximo: 10 MB.');

      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${userId}/${tipo.folder}/${Date.now()}.${ext}`;
      const upload = await supabase.storage
        .from('motorista-documentos')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (upload.error) throw upload.error;

      if (substituir) {
        const { error } = await supabase
          .from('motorista_documentos')
          .update({
            ficheiro_url: path,
            nome_ficheiro: file.name,
            status: 'pendente',
            updated_at: new Date().toISOString(),
          })
          .eq('id', substituir.id);
        if (error) throw error;
        // O ficheiro anterior deste pendente nunca chegou a ser visto: pode ir.
        await supabase.storage.from('motorista-documentos').remove([substituir.ficheiro_url]);
      } else {
        const { error } = await supabase.from('motorista_documentos').insert({
          motorista_id: motoristaId,
          tipo_documento: tipo.value,
          ficheiro_url: path,
          nome_ficheiro: file.name,
          status: 'pendente',
          uploaded_by: userId,
        });
        if (error) throw error;
      }

      return tipo;
    },
    onSuccess: (tipo) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, motoristaId] });
      toast.success(`${tipo.label} enviado. Fica em aprovação até a gestão validar.`);
    },
    onError: (e: unknown) => {
      toast.error(`Não foi possível enviar: ${errorMessage(e)}`);
    },
  });
}
