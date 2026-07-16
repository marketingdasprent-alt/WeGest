/**
 * Template de documento — alinhado com a tabela Supabase `document_templates`.
 *
 * Tipo único partilhado por toda a UI de templates (lista, editor, pré-visualização
 * e páginas de administração). Antes estava redefinido à mão em vários ficheiros, o
 * que levou a divergências e a erros de type-check.
 *
 * `template_data` e `campos_dinamicos` são colunas JSONB de estrutura livre,
 * consumidas dinamicamente pelo editor e pelo gerador de documentos; ficam
 * propositadamente largas (`any`) — apertar o tipo exige primeiro modelar o JSON.
 */
export interface DocumentTemplate {
  id: string;
  nome: string;
  tipo: string;
  empresa_id: string | null;
  cliente_empresa_id?: string | null;
  template_data: any;
  campos_dinamicos: any;
  papel_timbrado_url?: string | null;
  ativo: boolean;
  versao: number;
  created_at: string;
  updated_at: string;
}

// Tipos de template (coluna `tipo`, TEXT livre). Os de contrato têm semântica
// no gerador (escolha por regime); os restantes são documentos genéricos que
// aparecem no checklist "Gerar Documentos". Partilhado entre o editor e o
// filtro da tab de documentos.
//
// 'anexo_danos' fica de fora de propósito: a Folha de Danos é um documento
// fixo do sistema (não editável por admin), gerado só no fluxo de
// check-in/out/troca — ver DocumentosTab (exclui da lista) e
// GenerateDocumentsDialog/ContratoDocumentosDialog (excluem do checklist).
export const TIPO_TEMPLATE_OPTIONS = [
  { value: 'contrato_aluguer', label: 'Contrato de Aluguer' },
  { value: 'contrato_prestacao', label: 'Contrato de Prestação' },
  { value: 'contrato_tvde', label: 'Contrato TVDE' },
  { value: 'declaracao', label: 'Declaração' },
  { value: 'procedimentos', label: 'Procedimentos' },
  { value: 'recibo', label: 'Recibo' },
  { value: 'outro', label: 'Outro documento' },
] as const;
