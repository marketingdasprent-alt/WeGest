// Public API — re-exports exact same signatures as the original file
export { generateDocumentFromTemplate, generateDocumentosCombinados } from './generate-document';
export { uploadDocumentToStorage } from './upload';
export { fetchAvailableTemplates } from './fetch-templates';
export { checkUnresolvedPlaceholders } from './parser';

export type {
  AnexoDanoItem,
  AnexoFotoItem,
  AnexoDanos,
  DocumentTemplate,
  GenerateDocumentParams,
  UploadDocumentParams,
  DocumentoCombinado,
} from './types';
