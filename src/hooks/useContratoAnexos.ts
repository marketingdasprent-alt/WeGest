import { createAnexosHooks, ANEXO_MIME_DOCUMENTOS } from '@/hooks/createAnexosHooks';
import type { ContratoAnexo } from '@/types/contratoRenting';

const anexos = createAnexosHooks<ContratoAnexo>({
  table: 'contrato_anexos',
  fkColumn: 'contrato_id',
  bucket: 'contrato-anexos',
  queryDomain: ['renting', 'contrato-anexos'],
  maxBytes: 20 * 1024 * 1024, // 20 MB
  allowedMime: ANEXO_MIME_DOCUMENTOS,
  mimeError:
    'Tipo de ficheiro não permitido. Aceites: PDF, imagens (JPG/PNG/WebP), Word, Excel e texto.',
});

export const useContratoAnexos = anexos.useList;
export const useUploadContratoAnexo = anexos.useUpload;
export const useRenameContratoAnexo = anexos.useRename;
export const useDeleteContratoAnexo = anexos.useRemove;
export const getContratoAnexoSignedUrl = anexos.getSignedUrl;
