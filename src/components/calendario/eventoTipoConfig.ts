export const TIPO_LABELS: Record<string, string> = {
  entrega: 'Entrega',
  recolha: 'Recolha',
  devolucao: 'Devolução',
  troca: 'Troca',
  upgrade: 'Upgrade',
  lista_espera: 'Lista de Espera',
  transferencia: 'Transferência',
  slot: 'Slot',
};

/** Cor de destaque (borda do card) por tipo de evento. */
export const TIPO_BORDER_COLORS: Record<string, string> = {
  entrega: 'border-l-green-500',
  recolha: 'border-l-blue-500',
  devolucao: 'border-l-orange-500',
  troca: 'border-l-purple-500',
  upgrade: 'border-l-yellow-500',
  lista_espera: 'border-l-pink-500',
  transferencia: 'border-l-cyan-500',
  slot: 'border-l-amber-500',
};

/** Mesma paleta que TIPO_BORDER_COLORS, aplicada ao cabeçalho/acento de dialogs. */
export const TIPO_ACCENT_COLORS: Record<string, string> = {
  entrega: 'border-green-500 bg-green-50 dark:bg-green-950/30',
  recolha: 'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
  devolucao: 'border-orange-500 bg-orange-50 dark:bg-orange-950/30',
  troca: 'border-purple-500 bg-purple-50 dark:bg-purple-950/30',
  upgrade: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30',
  lista_espera: 'border-pink-500 bg-pink-50 dark:bg-pink-950/30',
  transferencia: 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30',
  slot: 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
};

export const TIPO_TITLE_COLORS: Record<string, string> = {
  entrega: 'text-green-700 dark:text-green-300',
  recolha: 'text-blue-700 dark:text-blue-300',
  devolucao: 'text-orange-700 dark:text-orange-300',
  troca: 'text-purple-700 dark:text-purple-300',
  upgrade: 'text-yellow-700 dark:text-yellow-300',
  lista_espera: 'text-pink-700 dark:text-pink-300',
  transferencia: 'text-cyan-700 dark:text-cyan-300',
  slot: 'text-amber-700 dark:text-amber-300',
};
