import type { AutomationNode as Node, PosicaoNo as XYPosition } from './dominio/tipos';
import { Bell, Filter, Mail, ToggleRight, Zap, type LucideIcon } from 'lucide-react';
import { identidadeDoModulo } from '../rotulos';

// Os gatilhos representam módulos; o evento é escolhido no painel de propriedades.
// Assim a paleta não mostra todos os eventos concretos.

export type TipoDeNo = 'trigger' | 'condicao' | 'accao';

export interface TemplateDeNo {
  chave: string;
  tipo: TipoDeNo;
  rotulo: string;
  descricao: string;
  Icone: LucideIcon;
  /** Fica fora de `dados` para não serializar metadados visuais no fluxo. */
  cor: string;
  dados: Record<string, unknown>;
}

const COOLDOWN_PADRAO_MINUTOS = 1440;

// O motor só avalia estes operadores; outro valor faria a condição passar sem filtrar.
export const OPERADORES = [
  { valor: '=', rotulo: 'é igual a' },
  { valor: '!=', rotulo: 'é diferente de' },
] as const;

// A identidade vem de `rotulos.ts` para paleta e canvas não divergirem.
function gatilho(chaveDoBloco: string, chaveDoModulo: string, descricao: string): TemplateDeNo {
  const modulo = identidadeDoModulo(chaveDoModulo);
  return {
    chave: chaveDoBloco,
    tipo: 'trigger',
    rotulo: modulo.nome,
    descricao,
    Icone: modulo.Icone,
    cor: modulo.token,
    dados: { modulo: modulo.chave, rotulo: modulo.nome, eventType: null },
  };
}

export const CATALOGO: TemplateDeNo[] = [
  gatilho('trigger-renting', 'contrato_renting', 'Contratos, reservas e devoluções'),
  gatilho('trigger-motoristas', 'motorista', 'Cartas, licenças, candidaturas e fichas'),
  gatilho('trigger-viaturas', 'viatura', 'Seguro, inspeção, IUC e manutenção'),
  gatilho('trigger-financeiro', 'cobranca', 'Cobranças, faturas, recibos e custos por imputar'),
  gatilho('trigger-assistencia', 'assistencia_ticket', 'Tickets abertos há demasiado tempo'),
  gatilho('trigger-seguranca', 'seguranca', 'Tentativas de login suspeitas'),
  gatilho('trigger-utilizadores', 'utilizador', 'Entrada de novos utilizadores'),
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
      // As ações vêm do catálogo do servidor; não duplicar um id neste template.
      accao: '',
      acaoTipo: 'automacao_interna',
      rotulo: 'Executar acção',
      campo: '',
      valor: '',
      cooldownMinutos: COOLDOWN_PADRAO_MINUTOS,
    },
  },
];

// Lista fechada: um evento que o motor não emite criaria uma regra silenciosa.
const EVENTOS_POR_MODULO: Record<string, string[]> = {
  assistencia_ticket: ['assistencia_ticket.aberto_demasiado_tempo'],
  cobranca: [
    'cobranca.em_atraso',
    'custo.sem_viatura',
    'cobranca.gerada',
    'invoice.nao_enviada_ao_cliente',
    // A validação do recibo é financeira, embora o evento use o prefixo motorista.
    'motorista_recibo.por_validar',
  ],
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
  seguranca: ['seguranca.login_suspeito'],
  utilizador: ['utilizador.criado'],
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

// Resolve metadados visuais a partir dos dados persistidos, sem os duplicar no nó.
export function visualDoBloco(
  tipo: TipoDeNo,
  dados: { modulo?: string; accao?: string; acaoTipo?: string }
): VisualDoBloco {
  const template = CATALOGO.find((t) => {
    if (t.tipo !== tipo) return false;
    if (tipo === 'trigger') return (t.dados as { modulo?: string }).modulo === dados.modulo;
    if (tipo === 'accao') {
      // A ação interna não tem id no template e precisa da entrada genérica.
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

// Ids sequenciais tornam o canvas reproduzível; cada nó recebe dados independentes.
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

// Usa o catálogo, não só o prefixo: `invoice` pertence ao módulo `cobranca`.
export function moduloDoEventType(eventType: string): string {
  const encontrado = Object.entries(EVENTOS_POR_MODULO).find(([, eventos]) =>
    eventos.includes(eventType)
  );
  return encontrado?.[0] ?? eventType.split('.')[0];
}

// Rótulos manuais preservam acentos e acrónimos que o identificador não contém.
const ROTULOS: Record<string, string> = {
  'assistencia_ticket.aberto_demasiado_tempo': 'Ticket aberto há demasiado tempo',
  'cobranca.em_atraso': 'Cobrança em atraso',
  'cobranca.gerada': 'Cobrança gerada',
  'custo.sem_viatura': 'Custo importado sem viatura atribuída',
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
  'motorista_recibo.por_validar': 'Recibo verde por validar',
  'viatura.extintor_expirando': 'Extintor a expirar',
  'viatura.inspecao_expirando': 'Inspeção periódica (IPO) a expirar',
  'viatura.iuc_a_pagar': 'IUC por pagar',
  'viatura.manutencao_preventiva_expirando': 'Manutenção preventiva a aproximar-se',
  'viatura.seguro_expirando': 'Seguro a expirar',
  'seguranca.login_suspeito': 'Tentativas de login suspeitas',
  'utilizador.criado': 'Novo utilizador criado',
};

// O teste exige que cada evento com rótulo seja escolhível na paleta.
export const EVENTOS_COM_ROTULO = Object.keys(ROTULOS);

// Um evento novo mantém o identificador para não produzir uma área vazia.
export function rotuloDoEvento(eventType: string): string {
  return ROTULOS[eventType] ?? eventType;
}
