import type { DocumentTemplateRow } from '@/hooks/useDocumentTemplates';

/**
 * Junta a Folha de Danos (anexo da viatura, ao nível da org, não da empresa
 * emissora) à lista de templates. Entra sempre no máximo UMA — a da empresa
 * seleccionada, senão a primeira da org — para não duplicar na checklist.
 */
export function templatesComFolhaDanos(
  todosTemplates: DocumentTemplateRow[],
  folhasOrg: DocumentTemplateRow[],
  empresaId: string
): DocumentTemplateRow[] {
  const folha = folhasOrg.find((t) => t.cliente_empresa_id === empresaId) ?? folhasOrg[0];
  // Map por id: se a folha já veio na lista da empresa, não duplica.
  const porId = new Map(todosTemplates.map((t) => [t.id, t]));
  if (folha) porId.set(folha.id, folha);
  return [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}
