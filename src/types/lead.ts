export interface Lead {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  zona?: string | null;
  data_aluguer?: string | null;
  status: string;
  campaign_tags?: string[] | null;
  created_at: string;
  formulario_id?: string | null;
  observacoes?: string | null;
  observacoes_gestores?: string | null;
  gestor_responsavel?: string | null;
  caucao_valor?: number | null;
}
