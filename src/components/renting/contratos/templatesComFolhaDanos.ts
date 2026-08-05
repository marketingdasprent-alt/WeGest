import type { DocumentTemplateRow } from '@/hooks/useDocumentTemplates';

/**
 * Junta a Folha de Danos à lista de templates do diálogo "Gerar Documentos".
 *
 * `useDocumentTemplates` devolve os templates da empresa emissora escolhida.
 * A folha de danos não segue essa regra — é um anexo da viatura e vive ao
 * nível da organização —, por isso vem de `useFolhasDanosDaOrg` e é enxertada
 * aqui.
 *
 * Entra sempre no máximo UMA: a atribuída à empresa seleccionada, se existir,
 * senão a primeira da org. Sem isto, uma org com várias empresas mostraria
 * várias folhas quase iguais na checklist.
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
