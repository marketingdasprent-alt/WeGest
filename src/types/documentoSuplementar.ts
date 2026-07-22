/**
 * Documento suplementar — ficheiro estático (PDF/Word/imagem) sem
 * placeholders dinâmicos, associável a várias empresas em simultâneo.
 * Alinhado com a tabela Supabase `documentos_suplementares`.
 */
export interface DocumentoSuplementar {
  id: string;
  nome: string;
  ficheiro_url: string;
  ficheiro_nome: string;
  mime_type: string;
  tamanho_bytes: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/** `DocumentoSuplementar` com as empresas associadas resolvidas (via `documento_suplementar_empresas`). */
export interface DocumentoSuplementarComEmpresas extends DocumentoSuplementar {
  empresaIds: string[];
}
