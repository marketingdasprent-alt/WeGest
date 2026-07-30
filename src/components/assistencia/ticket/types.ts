export interface Ticket {
  id: string;
  numero: number;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  status: string;
  created_at: string;
  updated_at: string;
  data_estimada: string | null;
  data_resolucao: string | null;
  viatura_id: string;
  motorista_id: string | null;
  categoria_id: string | null;
  criado_por: string | null;
  atribuido_a: string | null;
  mecanico_id: string | null;
  km_inicio: number | null;
  km_fim: number | null;
  combustivel_inicio: string | null;
  combustivel_fim: string | null;
  valor_reparacao: number | null;
  cobrar_motorista: boolean;
  viatura_substituta_id: string | null;
}

export interface Mensagem {
  id: string;
  mensagem: string;
  tipo: string;
  created_at: string;
  autor: {
    id: string;
    nome: string;
    cargo?: string;
    grupo?: { nome: string };
  } | null;
  anexos?: Anexo[];
}

export interface Anexo {
  id: string;
  nome_ficheiro: string;
  ficheiro_url: string;
  tipo_ficheiro: string | null;
  tamanho: number | null;
  created_at: string;
  mensagem_id: string | null;
  tipo_inspecao?: string | null;
  legenda?: string | null;
}

export interface Viatura {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  km_atual?: number | null;
}

export interface Motorista {
  id: string;
  nome: string;
  telefone: string | null;
}

export interface Categoria {
  id: string;
  nome: string;
  cor: string;
}

export interface ClosureData {
  km_fim: string;
  km_fim_indisponivel: boolean;
  combustivel_fim: string;
  adblue_fim: string;
  limpeza_fim: string;
  valor_reparacao: string;
  cobrar_motorista: boolean;
  descricao_reparacao: string;
  numero_fatura: string;
}
