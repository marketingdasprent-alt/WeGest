import { createAnexosHooks, ANEXO_MIME_DOCUMENTOS } from '@/hooks/createAnexosHooks';
import type { ReservaAnexo } from '@/types/reserva';

const anexos = createAnexosHooks<ReservaAnexo>({
  table: 'reserva_anexos',
  fkColumn: 'reserva_id',
  bucket: 'reserva-anexos',
  queryDomain: ['renting', 'reserva-anexos'],
  maxBytes: 20 * 1024 * 1024, // 20 MB
  allowedMime: ANEXO_MIME_DOCUMENTOS,
  mimeError:
    'Tipo de ficheiro não permitido. Aceites: PDF, imagens (JPG/PNG/WebP), Word, Excel e texto.',
});

/** Upload directo (sem hook). Útil para batch upload após criar reserva. */
export const uploadReservaAnexoSync = (
  reservaId: string,
  file: File,
  nomeOverride?: string
): Promise<void> => anexos.uploadSync(reservaId, file, nomeOverride);

export const useReservaAnexos = anexos.useList;
export const useUploadReservaAnexo = anexos.useUpload;
export const useRenameReservaAnexo = anexos.useRename;
export const useDeleteReservaAnexo = anexos.useRemove;
export const getReservaAnexoSignedUrl = anexos.getSignedUrl;
