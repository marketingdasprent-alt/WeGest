import type { AutomationNode as Node, PosicaoNo as XYPosition } from './dominio/tipos';
import {
  Bell,
  Car,
  Euro,
  Filter,
  LifeBuoy,
  Mail,
  ToggleRight,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Os blocos que o utilizador pode arrastar para o canvas.
 *
 * Os gatilhos são os MÓDULOS do WeGest, não eventos concretos: escolher o
 * evento é a primeira coisa que se faz no painel de propriedades, e uma lista
 * de 19 eventos na barra lateral seria uma parede em vez de uma paleta.
 */

export type TipoDeNo = 'trigger' | 'condicao' | 'accao';

export interface TemplateDeNo {
  /** Identificador estável — é o que viaja no dataTransfer do drag. */
  chave: string;
  tipo: TipoDeNo;
  rotulo: string;
  descricao: string;
  Icone: LucideIcon;
  /**
   * Nome do token CSS da cor do bloco (ver `index.css`).
   *
   * Fora de `dados` de propósito: o `serializarFluxo` copia `data` inteiro
   * para o payload, e nem a cor nem o ícone são lógica.
   */
  cor: string;
  /** Configuração inicial. Copiada a cada instância, nunca partilhada. */
  dados: Record<string, unknown>;
}

/** Uma vez por dia. É o mesmo valor por omissão das regras que já existem. */
const COOLDOWN_PADRAO_MINUTOS = 1440;

/**
 * Os únicos operadores que `process_domain_events` sabe avaliar.
 *
 * A função tem um ramo para '=' e outro para '!='. Qualquer outro operador
 * não entra em nenhum dos dois, `v_matches` fica true e a condição passa
 * SEMPRE — um filtro que parece funcionar e não filtra nada. Por isso a lista
 * é fechada e não texto livre.
 */
export const OPERADORES = [
  { valor: '=', rotulo: 'é igual a' },
  { valor: '!=', rotulo: 'é diferente de' },
] as const;

export const CATALOGO: TemplateDeNo[] = [
  {
    chave: 'trigger-renting',
    tipo: 'trigger',
    rotulo: 'Renting',
    descricao: 'Contratos, reservas e devoluções',
    Icone: Car,
    cor: '--fluxo-renting',
    dados: { modulo: 'contrato_renting', rotulo: 'Renting', eventType: null },
  },
  {
    chave: 'trigger-motoristas',
    tipo: 'trigger',
    rotulo: 'Motoristas',
    descricao: 'Cartas, licenças, candidaturas e fichas',
    Icone: Users,
    cor: '--fluxo-motoristas',
    dados: { modulo: 'motorista', rotulo: 'Motoristas', eventType: null },
  },
  {
    chave: 'trigger-viaturas',
    tipo: 'trigger',
    rotulo: 'Viaturas',
    descricao: 'Seguro, inspeção, IUC e manutenção',
    Icone: Wrench,
    cor: '--fluxo-viaturas',
    dados: { modulo: 'viatura', rotulo: 'Viaturas', eventType: null },
  },
  {
    chave: 'trigger-financeiro',
    tipo: 'trigger',
    rotulo: 'Financeiro',
    descricao: 'Cobranças geradas e faturas por enviar',
    Icone: Euro,
    cor: '--fluxo-financeiro',
    dados: { modulo: 'cobranca', rotulo: 'Financeiro', eventType: null },
  },
  {
    chave: 'trigger-assistencia',
    tipo: 'trigger',
    rotulo: 'Assistência',
    descricao: 'Tickets abertos há demasiado tempo',
    Icone: LifeBuoy,
    cor: '--fluxo-assistencia',
    dados: { modulo: 'assistencia_ticket', rotulo: 'Assistência', eventType: null },
  },
  {
    chave: 'condicao',
    tipo: 'condicao',
    rotulo: 'Só se',
    descricao: 'Compara um campo do evento antes de agir',
    Icone: Filter,
    cor: '--fluxo-condicao',
    dados: { rotulo: 'Só se', campo: '', operador: '=', valor: '' },
  },
  {
    chave: 'notificacao',
    tipo: 'accao',
    rotulo: 'Enviar notificação',
    // Já não é "com email opcional": o email tem acção própria desde a
    // divisão de 2026-09-01. Duas coisas, dois blocos — não um interruptor
    // escondido dentro de outra acção.
    descricao: 'Avisa cargos ou pessoas dentro da aplicação',
    Icone: Bell,
    cor: '--fluxo-notificacao',
    dados: {
      accao: 'notificacao',
      acaoTipo: 'notificacao',
      rotulo: 'Enviar notificação',
      cargoIds: [],
      cooldownMinutos: COOLDOWN_PADRAO_MINUTOS,
    },
  },
  {
    chave: 'email',
    tipo: 'accao',
    rotulo: 'Enviar email',
    descricao: 'Envia por correio a cargos ou pessoas, sem aviso na aplicação',
    Icone: Mail,
    cor: '--fluxo-email',
    dados: {
      accao: 'email',
      acaoTipo: 'email',
      rotulo: 'Enviar email',
      cargoIds: [],
      cooldownMinutos: COOLDOWN_PADRAO_MINUTOS,
    },
  },
  {
    chave: 'accao-interna',
    tipo: 'accao',
    rotulo: 'Executar acção',
    descricao: 'Altera um campo ou estado na entidade que disparou o fluxo',
    Icone: ToggleRight,
    cor: '--fluxo-estado',
    dados: {
      // `accao` vazio até o utilizador escolher no painel: as acções
      // disponíveis vêm de `automation_catalogo()`, e escrever aqui um id
      // fixo era duplicar o catálogo do servidor.
      accao: '',
      acaoTipo: 'automacao_interna',
      rotulo: 'Executar acção',
      campo: '',
      valor: '',
      cooldownMinutos: COOLDOWN_PADRAO_MINUTOS,
    },
  },
];

/**
 * Os `event_type` que o motor conhece, agrupados pelo prefixo do módulo.
 *
 * Lista fechada de propósito: `process_domain_events` só casa eventos que
 * alguém emite: um event_type inventado no construtor daria uma regra que
 * nunca dispara e não teria como avisar disso. Verificado em produção a
 * 2026-08-26 — 19 distintos.
 */
const EVENTOS_POR_MODULO: Record<string, string[]> = {
  assistencia_ticket: ['assistencia_ticket.aberto_demasiado_tempo'],
  cobranca: ['cobranca.gerada', 'invoice.nao_enviada_ao_cliente'],
  contrato_renting: [
    'contrato_renting.criado',
    'contrato_renting.fechado_com_danos',
    'contrato_renting.renovacao_proxima',
    'contrato_renting.sem_checkin',
  ],
  motorista: [
    'motorista.candidatura_parada',
    'motorista.carta_expirando',
    'motorista.ficha_incompleta',
    'motorista.licenca_tvde_expirando',
    'motorista.reparacao_cobranca',
  ],
  viatura: [
    'viatura.extintor_expirando',
    'viatura.inspecao_expirando',
    'viatura.iuc_a_pagar',
    'viatura.manutencao_preventiva_expirando',
    'viatura.seguro_expirando',
  ],
};

export function eventosDoModulo(modulo: string): string[] {
  return EVENTOS_POR_MODULO[modulo] ?? [];
}

export interface VisualDoBloco {
  Icone: LucideIcon;
  cor: string;
}

const VISUAL_RECURSO: VisualDoBloco = { Icone: Zap, cor: '--fluxo-viaturas' };

/**
 * O ícone e a cor de um nó, a partir do que ele guarda em `data`.
 *
 * O nó só guarda o `modulo` (gatilho) ou a `accao` — dados a sério. O resto do
 * visual é resolvido aqui, para que a paleta e o canvas mostrem sempre o mesmo
 * símbolo e a mesma cor sem duplicar a informação em dois sítios.
 */
export function visualDoBloco(
  tipo: TipoDeNo,
  dados: { modulo?: string; accao?: string; acaoTipo?: string }
): VisualDoBloco {
  const template = CATALOGO.find((t) => {
    if (t.tipo !== tipo) return false;
    if (tipo === 'trigger') return (t.dados as { modulo?: string }).modulo === dados.modulo;
    if (tipo === 'accao') {
      // Uma acção interna não casa por `accao`: o id vem de
      // `automation_catalogo()` e a paleta tem uma entrada só, com `accao`
      // vazio. Sem este ramo, cada acção interna caía no visual genérico.
      if (dados.acaoTipo === 'automacao_interna') return t.chave === 'accao-interna';
      return (t.dados as { accao?: string }).accao === dados.accao;
    }
    return true;
  });

  return template ? { Icone: template.Icone, cor: template.cor } : VISUAL_RECURSO;
}

export function templatePorChave(chave: string): TemplateDeNo | undefined {
  return CATALOGO.find((t) => t.chave === chave);
}

/**
 * Instancia um bloco no sítio onde foi largado.
 *
 * `sequencia` vem de um contador do componente e não de Date.now()/random:
 * ids previsíveis tornam o estado do canvas reproduzível nos testes.
 * `structuredClone` porque partilhar o objecto `dados` do template fazia
 * editar um bloco editar todos os irmãos.
 */
export function criarNoDoTemplate(
  template: TemplateDeNo,
  posicao: XYPosition,
  sequencia: number
): Node {
  return {
    id: `${template.chave}-${sequencia}`,
    type: template.tipo,
    position: posicao,
    data: structuredClone(template.dados),
  };
}

/**
 * O módulo do catálogo a que um `event_type` pertence.
 *
 * Não é o prefixo cru: 'invoice.nao_enviada_ao_cliente' pertence ao módulo
 * Financeiro, cuja chave é 'cobranca'. Usar o prefixo dava um módulo que o
 * catálogo não conhece, e o bloco abria sem ícone, sem cor e sem lista de
 * eventos onde escolher.
 */
export function moduloDoEventType(eventType: string): string {
  const encontrado = Object.entries(EVENTOS_POR_MODULO).find(([, eventos]) =>
    eventos.includes(eventType)
  );
  return encontrado?.[0] ?? eventType.split('.')[0];
}

/**
 * Nome legível de cada evento.
 *
 * Escrito à mão, não gerado. Uma tradução mecânica do identificador — trocar
 * `_` por espaços e capitalizar — dava "Iuc a pagar" e "Licenca tvde
 * expirando": a coluna `event_type` não tem acentos nem sabe o que é um
 * acrónimo. Com 19 eventos, um mapa é mais barato do que qualquer heurística
 * e não erra.
 *
 * O identificador continua visível ao lado, em monoespaçado: é ele que o motor
 * casa, e é o que se copia para depurar.
 */
const ROTULOS: Record<string, string> = {
  'assistencia_ticket.aberto_demasiado_tempo': 'Ticket aberto há demasiado tempo',
  'cobranca.gerada': 'Cobrança gerada',
  'invoice.nao_enviada_ao_cliente': 'Fatura emitida sem ser enviada',
  'contrato_renting.criado': 'Contrato criado',
  'contrato_renting.fechado_com_danos': 'Contrato fechado com danos',
  'contrato_renting.renovacao_proxima': 'Renovação a aproximar-se',
  'contrato_renting.sem_checkin': 'Reserva sem check-in de devolução',
  'motorista.candidatura_parada': 'Candidatura parada por aceitar',
  'motorista.carta_expirando': 'Carta de condução a expirar',
  'motorista.ficha_incompleta': 'Ficha do motorista incompleta',
  'motorista.licenca_tvde_expirando': 'Licença TVDE a expirar',
  'motorista.reparacao_cobranca': 'Reparação com valor a cobrar',
  'viatura.extintor_expirando': 'Extintor a expirar',
  'viatura.inspecao_expirando': 'Inspeção periódica (IPO) a expirar',
  'viatura.iuc_a_pagar': 'IUC por pagar',
  'viatura.manutencao_preventiva_expirando': 'Manutenção preventiva a aproximar-se',
  'viatura.seguro_expirando': 'Seguro a expirar',
  'seguranca.login_suspeito': 'Tentativas de login suspeitas',
  'utilizador.criado': 'Novo utilizador criado',
};

/** Cai para o identificador: um evento novo no motor não pode dar ecrã vazio. */
export function rotuloDoEvento(eventType: string): string {
  return ROTULOS[eventType] ?? eventType;
}
