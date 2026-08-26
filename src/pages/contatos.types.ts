/**
 * Tipo e constantes do quadro de contactos (leads).
 *
 * Extraídos de Contatos.tsx, que tinha crescido para 502 linhas e passado o
 * limite `max-lines` de 500. A alternativa era acrescentá-lo à lista
 * `filesExceedingMaxLines` do eslint.config.js — uma lista cujo cabeçalho diz
 * "legacy [...] refactor futuro", ou seja, dívida a pagar e não a aumentar.
 *
 * Segue o padrão que o projecto já usa em `cartoesFlotaTab.types.ts`.
 */

export interface Lead {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  zona?: string;
  data_aluguer?: string;
  status: string;
  campaign_tags?: string[];
  created_at: string;
  formulario_id?: string;
  observacoes?: string;
}

export const statusColors = {
  novo: 'bg-blue-500',
  contactado: 'bg-yellow-500',
  interessado: 'bg-green-500',
  convertido: 'bg-purple-500',
  perdido: 'bg-red-500',
};

export const statusLabels = {
  novo: 'Novo',
  contactado: 'Contactado',
  interessado: 'Interessado',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

/** Colunas do quadro kanban, por ordem de progressão do lead. */
export const statusColumns = [
  { id: 'novo', title: 'Novo', color: '#3b82f6', icon: '🆕' },
  { id: 'contactado', title: 'Contactado', color: '#eab308', icon: '📞' },
  { id: 'interessado', title: 'Interessado', color: '#22c55e', icon: '👍' },
  { id: 'convertido', title: 'Convertido', color: '#8b5cf6', icon: '✅' },
  { id: 'perdido', title: 'Perdido', color: '#ef4444', icon: '❌' },
];

export const ITEMS_PER_PAGE = 50;
