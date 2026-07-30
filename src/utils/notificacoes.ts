import type { Notificacao } from '@/types/notificacao';

/**
 * Destino e rótulo do botão "Ver" de cada tipo de notificação.
 *
 * PORQUE ISTO É UM MAPA EXPLÍCITO E NÃO UMA CADEIA DE `if`s
 * A base de dados aceita 25 tipos (CHECK `notificacoes_tipo_check`). A versão
 * anterior deste ficheiro rotulava 10 e tinha `return 'Ver candidatura'` como
 * fallback — ou seja, um alerta de login suspeito, uma fatura por enviar e um
 * ticket em atraso mostravam todos um botão a dizer **"Ver candidatura"** que
 * levava a `/motoristas/candidaturas`. O produto dizia ao utilizador uma coisa
 * que não era verdade, e levava-o ao ecrã errado.
 *
 * Com um mapa indexado pelo tipo, um tipo novo na base de dados aparece aqui em
 * falta (e cai num fallback honesto) em vez de ser silenciosamente etiquetado
 * como outra coisa. O teste `notificacoes.test.ts` compara este mapa com a
 * lista de tipos e falha se algum ficar de fora.
 */

/** Todos os tipos aceites por `notificacoes_tipo_check`, na BD. */
export const TIPOS_NOTIFICACAO = [
  'assistencia_ticket_aberto_demasiado_tempo',
  'cobranca_gerada',
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
  'motorista_reparacao_cobranca',
  'pedido_troca_kms',
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
  /** Texto do botão. Diz o que o utilizador vai encontrar, não o que o sistema fez. */
  label: string;
  /** Rota base. Todas verificadas em WebAppRoutes.tsx. */
  rota: string;
  /**
   * Quando presente, a rota fica mais específica se a notificação trouxer o id
   * dessa entidade (ex.: viatura_id → /viaturas/<id>).
   */
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
  // Estes dois são genuinamente candidaturas — é o único sítio onde
  // "Ver candidatura" está correcto.
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
  // Dirigidas AO MOTORISTA, não ao staff: o destino é o portal dele, onde tem
  // acesso. Mandá-lo para uma rota de staff dava-lhe um ecrã sem permissão.
  motorista_ficha_incompleta: { label: 'Completar ficha', rota: '/motorista/painel' },
  motorista_reparacao_cobranca: { label: 'Ver conta', rota: '/motorista/painel' },

  // ── Contratos e reservas ────────────────────────────────────────────────
  contrato_renting_criado: { label: 'Ver contrato', rota: '/renting/contratos' },
  contrato_renting_renovacao_proxima: { label: 'Ver contrato', rota: '/renting/contratos' },
  contrato_renting_sem_checkin: { label: 'Ver contrato', rota: '/renting/contratos' },
  pedido_troca_kms: { label: 'Ver pedido', rota: '/renting/pedidos-kms' },

  // ── Financeiro ──────────────────────────────────────────────────────────
  cobranca_gerada: { label: 'Ver cobrança', rota: '/administrativo/faturacao' },
  invoice_nao_enviada_ao_cliente: { label: 'Ver fatura', rota: '/administrativo/faturacao' },
  recibo_anulado: { label: 'Ver recibos', rota: '/administrativo' },

  // ── Assistência e calendário ────────────────────────────────────────────
  assistencia_ticket_aberto_demasiado_tempo: { label: 'Ver ticket', rota: '/assistencia' },
  escalonamento: { label: 'Ver evento', rota: '/calendario' },

  // ── Sistema e segurança ─────────────────────────────────────────────────
  seguranca_login_suspeito: { label: 'Ver utilizadores', rota: '/admin/settings' },
  utilizador_criado: { label: 'Ver utilizadores', rota: '/admin/settings' },
  sistema_job_falhou: { label: 'Ver falhas', rota: '/admin/automacao' },
  sistema_limite_email_atingido: { label: 'Ver automações', rota: '/admin/automacao' },
};

/**
 * Fallback para um tipo que ainda não esteja no mapa.
 *
 * Leva à própria lista de notificações: é o único destino que existe sempre e
 * que nunca engana. Antes, um tipo desconhecido dizia "Ver candidatura" e
 * levava às candidaturas de motorista — uma afirmação falsa sobre o que o
 * utilizador ia encontrar.
 */
const DESTINO_DESCONHECIDO: DestinoNotificacao = {
  label: 'Ver detalhe',
  rota: '/notificacoes',
};

function destinoDe(n: Notificacao): DestinoNotificacao {
  return DESTINOS[n.tipo as TipoNotificacao] ?? DESTINO_DESCONHECIDO;
}

/**
 * Rota de destino do botão "Ver".
 *
 * `n.link` tem prioridade: é preenchido pelo motor de automação com a rota
 * exacta da entidade que originou o aviso, e é sempre mais específico do que
 * qualquer coisa que se derive do tipo.
 */
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

/** Texto do botão "Ver" — descreve o que o utilizador vai encontrar. */
export const notificacaoLabel = (n: Notificacao): string => destinoDe(n).label;

/**
 * Título a mostrar.
 *
 * `titulo` é NOT NULL na tabela, mas string vazia passa a constraint, e payloads
 * de realtime e selects parciais chegam sem a coluna. Nesses casos o cartão
 * renderizava um espaço em branco onde devia estar o assunto do aviso — dava um
 * cartão com dois botões e nada escrito.
 */
export const notificacaoTitulo = (n: Notificacao): string => n.titulo?.trim() || 'Aviso do sistema';

/**
 * Nome da entidade a que a notificação diz respeito, no singular e capitalizado
 * ("Viatura", "Ticket", "Contrato").
 *
 * Derivado do rótulo do botão em vez de um segundo mapa: um mapa paralelo
 * indexado pelos mesmos 25 tipos divergiria do primeiro na primeira vez que
 * alguém alterasse só um deles.
 */
function entidadeDe(n: Notificacao): string {
  const label = destinoDe(n).label;
  if (!label.startsWith('Ver ')) return 'Registo';
  const nome = label.slice(4);
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** Primeiro segmento de um UUID — curto, mas suficiente para correlacionar. */
function referenciaCurta(link: string): string | null {
  const ultimo = link.split(/[/?#]/).filter(Boolean).pop();
  if (!ultimo) return null;
  // Só encurta o que parece um id: um segmento legível ("faturacao") deve
  // continuar a ler-se por inteiro.
  const pareceId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ultimo);
  return pareceId ? ultimo.slice(0, 8) : null;
}

/**
 * Texto de uma entidade dentro de uma notificação agrupada.
 *
 * ANTES: `item.mensagem || item.link` — quando o item não trazia mensagem (que é
 * o caso comum, porque o trigger só a preenche em alguns tipos), a lista
 * mostrava o URL em cru:
 *
 *     /assistencia/4309204a-5499-402a-b744-ae7ff8713c...
 *
 * Dezesseis linhas de UUID truncado não dizem ao gestor qual é o ticket, e
 * expõem a estrutura de rotas da aplicação num sítio onde devia estar o nome de
 * uma coisa. Agora o pior caso é "Ticket #4309204a", que é legível e ainda
 * permite encontrar o registo na lista respetiva.
 *
 * @param indice Posição na lista, usada quando não há mensagem nem id.
 */
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
