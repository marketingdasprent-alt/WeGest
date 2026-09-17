import type { Notificacao } from '@/types/notificacao';

// O mapa mantém cada tipo com um destino honesto; tipos novos usam o fallback.
export const TIPOS_NOTIFICACAO = [
  'assistencia_ticket_aberto_demasiado_tempo',
  'cobranca_em_atraso',
  'cobranca_gerada',
  'custo_sem_viatura',
  'contrato_renting_criado',
  'contrato_renting_renovacao_proxima',
  'contrato_renting_sem_checkin',
  'escalonamento',
  'invoice_nao_enviada_ao_cliente',
  'motorista_candidatura_parada',
  'motorista_carta_expirando',
  'motorista_ficha_incompleta',
  'motorista_licenca_tvde_expirando',
  'motorista_pendente',
  'motorista_recibo_por_validar',
  'motorista_reparacao_cobranca',
  'pedido_troca_kms',
  'plataforma_semana_em_falta',
  'recibo_anulado',
  'seguranca_login_suspeito',
  'sistema_job_falhou',
  'sistema_limite_email_atingido',
  'utilizador_criado',
  'viatura_disponivel',
  'viatura_extintor_expirando',
  'viatura_inspecao_expirando',
  'viatura_iuc_a_pagar',
  'viatura_manutencao_preventiva_expirando',
  'viatura_seguro_expirando',
] as const;

export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number];

interface DestinoNotificacao {
  label: string;
  rota: string;
  especificaPor?: 'viatura_id' | 'candidatura_id';
}

const DESTINOS: Record<TipoNotificacao, DestinoNotificacao> = {
  // ── Viaturas ────────────────────────────────────────────────────────────
  viatura_disponivel: { label: 'Ver viatura', rota: '/viaturas', especificaPor: 'viatura_id' },
  viatura_seguro_expirando: {
    label: 'Ver viatura',
    rota: '/viaturas',
    especificaPor: 'viatura_id',
  },
  viatura_inspecao_expirando: {
    label: 'Ver viatura',
    rota: '/viaturas',
    especificaPor: 'viatura_id',
  },
  viatura_extintor_expirando: {
    label: 'Ver viatura',
    rota: '/viaturas',
    especificaPor: 'viatura_id',
  },
  viatura_iuc_a_pagar: { label: 'Ver viatura', rota: '/viaturas', especificaPor: 'viatura_id' },
  viatura_manutencao_preventiva_expirando: {
    label: 'Ver viatura',
    rota: '/viaturas',
    especificaPor: 'viatura_id',
  },

  // ── Motoristas ──────────────────────────────────────────────────────────
  motorista_pendente: {
    label: 'Ver candidatura',
    rota: '/motoristas/candidaturas',
    especificaPor: 'candidatura_id',
  },
  motorista_candidatura_parada: {
    label: 'Ver candidatura',
    rota: '/motoristas/candidaturas',
    especificaPor: 'candidatura_id',
  },
  motorista_carta_expirando: { label: 'Ver motorista', rota: '/motoristas' },
  motorista_licenca_tvde_expirando: { label: 'Ver motorista', rota: '/motoristas' },
  // Notificações do motorista seguem para o portal, não para uma rota de staff.
  motorista_ficha_incompleta: { label: 'Completar ficha', rota: '/motorista/painel' },
  motorista_reparacao_cobranca: { label: 'Ver conta', rota: '/motorista/painel' },

  // ── Contratos e reservas ────────────────────────────────────────────────
  contrato_renting_criado: { label: 'Ver contrato', rota: '/renting/contratos' },
  contrato_renting_renovacao_proxima: { label: 'Ver contrato', rota: '/renting/contratos' },
  contrato_renting_sem_checkin: { label: 'Ver contrato', rota: '/renting/contratos' },
  pedido_troca_kms: { label: 'Ver pedido', rota: '/renting/pedidos-kms' },

  // ── Financeiro ──────────────────────────────────────────────────────────
  cobranca_gerada: { label: 'Ver cobrança', rota: '/administrativo/faturacao' },
  cobranca_em_atraso: { label: 'Ver cobrança', rota: '/administrativo/faturacao' },
  motorista_recibo_por_validar: { label: 'Ver recibos', rota: '/administrativo' },
  custo_sem_viatura: { label: 'Ver importações', rota: '/administrativo' },
  invoice_nao_enviada_ao_cliente: { label: 'Ver fatura', rota: '/administrativo/faturacao' },
  recibo_anulado: { label: 'Ver recibos', rota: '/administrativo' },

  // ── Assistência e calendário ────────────────────────────────────────────
  assistencia_ticket_aberto_demasiado_tempo: { label: 'Ver ticket', rota: '/assistencia' },
  escalonamento: { label: 'Ver evento', rota: '/calendario' },

  // ── Plataformas ─────────────────────────────────────────────────────────
  plataforma_semana_em_falta: { label: 'Ver integrações', rota: '/admin/settings' },

  // ── Sistema e segurança ─────────────────────────────────────────────────
  seguranca_login_suspeito: { label: 'Ver utilizadores', rota: '/admin/settings' },
  utilizador_criado: { label: 'Ver utilizadores', rota: '/admin/settings' },
  sistema_job_falhou: { label: 'Ver falhas', rota: '/admin/automacao' },
  sistema_limite_email_atingido: { label: 'Ver automações', rota: '/admin/automacao' },
};

// Tipos não mapeados seguem para a lista, o único destino sempre válido.
const DESTINO_DESCONHECIDO: DestinoNotificacao = {
  label: 'Ver detalhe',
  rota: '/notificacoes',
};

function destinoDe(n: Notificacao): DestinoNotificacao {
  return DESTINOS[n.tipo as TipoNotificacao] ?? DESTINO_DESCONHECIDO;
}

export const notificacaoLink = (n: Notificacao): string => {
  if (n.link) return n.link;

  const destino = destinoDe(n);

  if (destino.especificaPor === 'viatura_id' && n.viatura_id) {
    return `${destino.rota}/${n.viatura_id}`;
  }
  if (destino.especificaPor === 'candidatura_id' && n.candidatura_id) {
    return `${destino.rota}?candidatura=${n.candidatura_id}`;
  }

  return destino.rota;
};

export const notificacaoLabel = (n: Notificacao): string => destinoDe(n).label;

// Payloads parciais de realtime podem não trazer título utilizável.
export const notificacaoTitulo = (n: Notificacao): string => n.titulo?.trim() || 'Aviso do sistema';

function entidadeDe(n: Notificacao): string {
  const label = destinoDe(n).label;
  if (!label.startsWith('Ver ')) return 'Registo';
  const nome = label.slice(4);
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function referenciaCurta(link: string): string | null {
  const ultimo = link.split(/[/?#]/).filter(Boolean).pop();
  if (!ultimo) return null;
  // Não encurte segmentos legíveis de rota.
  const pareceId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ultimo);
  return pareceId ? ultimo.slice(0, 8) : null;
}

// O fallback nunca expõe URLs; tipo e UUID curto mantêm o registo pesquisável.
export const notificacaoItemTexto = (
  n: Notificacao,
  item: { mensagem?: string; link?: string },
  indice: number
): string => {
  if (item.mensagem) return item.mensagem;

  const entidade = entidadeDe(n);
  const referencia = item.link ? referenciaCurta(item.link) : null;

  return referencia ? `${entidade} #${referencia}` : `${entidade} ${indice + 1}`;
};
