import { createAnexosHooks } from '@/hooks/createAnexosHooks';
import type { MovimentoAnexo } from '@/types/movimento';

export const MOVIMENTO_ANEXO_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

const anexos = createAnexosHooks<MovimentoAnexo>({
  table: 'movimento_anexos',
  fkColumn: 'movimento_id',
  bucket: 'movimento-anexos',
  queryDomain: ['renting', 'movimento-anexos'],
  maxBytes: 20 * 1024 * 1024, // 20 MB
  allowedMime: new Set<string>(MOVIMENTO_ANEXO_MIME),
  mimeError: 'Tipo de ficheiro não permitido. Aceites: imagens (JPG/PNG/WebP/HEIC) e PDF.',
  uploadOkTitle: 'Ficheiro carregado',
});

/** Upload direto (sem hook). Útil para o batch upload após criar o movimento. */
export const uploadMovimentoAnexoSync = (
  movimentoId: string,
  file: File,
  nomeOverride?: string
): Promise<void> => anexos.uploadSync(movimentoId, file, nomeOverride);

export const useMovimentoAnexos = anexos.useList;
export const useUploadMovimentoAnexo = anexos.useUpload;
export const useRenameMovimentoAnexo = anexos.useRename;
export const useDeleteMovimentoAnexo = anexos.useRemove;
export const getMovimentoAnexoSignedUrl = anexos.getSignedUrl;
