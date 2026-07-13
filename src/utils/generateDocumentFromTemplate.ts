/**
 * @file Entry point for document template generation.
 * All implementation lives in src/utils/document-template/.
 * This barrel re-exports the public API with exact same signatures.
 */
export {
  generateDocumentFromTemplate,
  generateDocumentosCombinados,
} from './document-template/generate-document';
export { uploadDocumentToStorage } from './document-template/upload';
export { fetchAvailableTemplates } from './document-template/fetch-templates';
export { checkUnresolvedPlaceholders } from './document-template/parser';

export type {
  AnexoDanoItem,
  AnexoFotoItem,
  AnexoDanos,
  DocumentoCombinado,
} from './document-template/types';
