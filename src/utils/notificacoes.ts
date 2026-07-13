import type { Tables } from '@/integrations/supabase/types';

type Notificacao = Tables<'notificacoes'>;

/**
 * Destino do botão "Ver" por tipo de notificação.
 * `link` genérico tem prioridade (ex.: avisos de lista de espera); depois
 * resolve-se por tipo (viatura disponível → detalhe da viatura) e, por fim,
 * cai nas candidaturas.
 */
export const notificacaoLink = (n: Notificacao): string => {
  if (n.link) return n.link;
  if (n.tipo === 'viatura_disponivel' && n.viatura_id) return `/viaturas/${n.viatura_id}`;
  if (n.tipo === 'pedido_troca_kms') return '/renting/pedidos-kms';
  return n.candidatura_id
    ? `/motoristas/candidaturas?candidatura=${n.candidatura_id}`
    : '/motoristas/candidaturas';
};

/** Label do botão "Ver" por tipo de notificação. */
export const notificacaoLabel = (n: Notificacao): string => {
  if (n.tipo === 'viatura_disponivel') return 'Ver viatura';
  if (n.tipo === 'pedido_troca_kms') return 'Ver pedido';
  return 'Ver candidatura';
};
