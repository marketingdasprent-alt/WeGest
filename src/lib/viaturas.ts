export interface ViaturaStatsSummary {
  total: number;
  disponiveis: number;
  emUso: number;
  manutencao: number;
  vendidas: number;
  slot: number;
  slotDisponiveis: number;
}

export const CATEGORIAS = [
  { value: 'green', label: 'Green' },
  { value: 'comfort', label: 'Comfort' },
  { value: 'black', label: 'Black' },
  { value: 'x-saver', label: 'X-Saver' },
];

export const COMBUSTIVEIS = [
  { value: 'eletrico', label: 'Elétrico' },
  { value: 'hibrido', label: 'Híbrido' },
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'diesel', label: 'Diesel' },
];

export const STATUS_OPTIONS = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'em_uso', label: 'Em Uso' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'inativo', label: 'Inativo' },
];

export const normalizePlate = (value?: string | null) =>
  (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const getCategoriaBadgeClass = (categoria?: string | null) => {
  switch (categoria?.toLowerCase()) {
    case 'green':
      return 'bg-green-500 text-white';
    case 'comfort':
      return 'bg-blue-500 text-white';
    case 'black':
      return 'bg-foreground text-background';
    case 'x-saver':
      return 'bg-orange-500 text-white';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export const getStatusBadgeClass = (status?: string | null) => {
  const s = (status || '').toLowerCase().replace('í', 'i').replace('ç', 'c').replace('ã', 'a');
  switch (s) {
    case 'disponivel':
      return 'bg-green-500/10 text-green-600 border-green-500/20';
    case 'em_uso':
    case 'em uso':
    case 'em_contrato':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'em_reserva':
      return 'bg-violet-500/10 text-violet-600 border-violet-500/20';
    case 'em_movimentacao':
      return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20';
    case 'em_tvde':
      return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20';
    case 'em_slot':
      return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    case 'manutencao':
    case 'manutenção':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'vendida':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'inativo':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

export const getStatusColorClass = (status?: string | null) => {
  const s = (status || '').toLowerCase().replace('í', 'i');
  switch (s) {
    case 'disponivel':
      return 'bg-green-500 text-white hover:bg-green-600';
    case 'em_uso':
    case 'em uso':
      return 'bg-blue-500 text-white hover:bg-blue-600';
    case 'manutencao':
    case 'manutenção':
      return 'bg-amber-500 text-white hover:bg-amber-600';
    case 'vendida':
      return 'bg-destructive text-white hover:bg-destructive/90';
    case 'inativo':
      return 'bg-gray-500 text-white hover:bg-gray-600';
    default:
      return 'bg-gray-400 text-white hover:bg-gray-500';
  }
};

export const getStatusLabel = (status?: string | null) => {
  const s = (status || '').toLowerCase().replace('í', 'i').replace('ç', 'c').replace('ã', 'a');
  switch (s) {
    case 'disponivel':
      return 'Disponível';
    case 'em_uso':
    case 'em uso':
      return 'Em Uso';
    case 'em_reserva':
      return 'Em reserva';
    case 'em_contrato':
      return 'Em contrato';
    case 'em_movimentacao':
      return 'Em movimentação';
    case 'em_tvde':
      return 'Em TVDE';
    case 'em_slot':
      return 'Em slot';
    case 'manutencao':
    case 'manutenção':
      return 'Manutenção';
    case 'vendida':
      return 'Vendida';
    case 'inativo':
      return 'Inativo';
    default:
      return status || 'N/D';
  }
};

// ── Estado derivado da viatura ──────────────────────────────────────
// O estado de exibição é derivado das ocupações ativas (contrato, reserva,
// movimento, reparação) cruzadas pelo RPC viaturas_com_disponibilidade,
// sobrepostas ao status base guardado (disponivel/inativo/manutencao/vendida).
// 'em_uso' como status manual foi descontinuado — passou a ser o agregado
// de em_reserva + em_contrato + em_movimentacao.

export type ViaturaEstadoFonte = 'contrato' | 'reserva' | 'movimento' | 'reparacao' | 'tvde';

/** Estados que contam como "Em Uso" (viatura ocupada). */
export const ESTADOS_EM_USO = [
  'em_reserva',
  'em_contrato',
  'em_movimentacao',
  'em_tvde',
  'em_slot',
  'em_uso',
] as const;

export const deriveViaturaEstado = (
  v: { status?: string | null; is_vendida?: boolean | null; is_slot?: boolean | null },
  fontes?: Set<string> | null
): string => {
  if (v.is_vendida) return 'vendida';
  const base = (v.status || '').toLowerCase();
  if (base === 'inativo') return 'inativo';
  if (base === 'manutencao' || base === 'manutenção' || fontes?.has('reparacao'))
    return 'manutencao';
  if (fontes?.has('movimento')) return 'em_movimentacao';
  if (fontes?.has('contrato')) return 'em_contrato';
  if (fontes?.has('reserva')) return 'em_reserva';
  // Carro com motorista (fonte 'tvde'): ocupação TVDE normal — excepto os
  // carros slot: são do próprio motorista, e a mera associação NÃO os ocupa.
  // Um carro slot associado fica 'disponivel'; o estado só muda quando entra
  // uma reserva/contrato (fontes acima).
  if (fontes?.has('tvde') && !v.is_slot) return 'em_tvde';
  // Rede de segurança: campo legado `status='em_uso'` — é o que o main conta
  // como ocupada. Mantém-se até as atribuições reais (motorista_viaturas)
  // estarem todas criadas; depois pode ser removido.
  // Carros slot NÃO usam esta rede: sem motorista ligado real, um slot está
  // disponível. Sem isto, mostravam "Em Uso" genérico de forma incoerente.
  if (!v.is_slot && (base === 'em_uso' || base === 'em uso')) return 'em_uso';
  return 'disponivel';
};
