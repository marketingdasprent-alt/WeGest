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
