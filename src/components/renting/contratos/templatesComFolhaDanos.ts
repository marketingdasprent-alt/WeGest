import type { DocumentTemplateRow } from '@/hooks/useDocumentTemplates';

export function templatesComFolhaDanos(
  todosTemplates: DocumentTemplateRow[],
  folhasOrg: DocumentTemplateRow[],
  empresaId: string
): DocumentTemplateRow[] {
  const folha = folhasOrg.find((t) => t.cliente_empresa_id === empresaId) ?? folhasOrg[0];
  const porId = new Map(todosTemplates.map((t) => [t.id, t]));
  if (folha) porId.set(folha.id, folha);
  return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}
