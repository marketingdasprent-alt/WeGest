/**
 * Constantes para ContratoForm
 * Valores, opções e configurações reutilizáveis
 */

export const SENTINEL_NONE = '__none__';

export const ESTADO_OP_OPTIONS = [
  { value: 'agendado', label: 'Agendado' },
  { value: 'em_curso', label: 'Em Curso' },
  // Ver CONTRATO_ESTADO_OP_LABELS — manter os dois rótulos alinhados.
  // 'devolvido'/'recolhido' NÃO aparecem aqui: não são estados do contrato,
  // são o `tipo_fecho`, e só se escolhem no diálogo de fecho.
  { value: 'fechado', label: 'Fechado' },
  { value: 'cancelado', label: 'Cancelado' },
] as const;

export const ESTADO_FIN_OPTIONS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'facturado', label: 'Facturado' },
  { value: 'pago', label: 'Pago' },
  { value: 'anulado', label: 'Anulado' },
] as const;

export const DEFAULT_IVA_PERCENTAGE = 23;

export const MODALIDADE_OPTIONS = [
  { value: 'rent_a_car', label: 'Rent-a-car' },
  { value: 'tvde', label: 'TVDE' },
] as const;

/**
 * Contrato aberto: corta o clique nos controlos, não no bloco todo. O Select
 * da Radix abre pelo seu próprio estado em JS e ignora o `disabled` nativo do
 * fieldset, por isso precisa disto. O texto à volta (nome, NIF, telemóvel do
 * condutor) continua selecionável para se poder copiar.
 */
export const CONTROLOS_SEM_CLIQUE = [
  '[&_button]:pointer-events-none',
  '[&_input]:pointer-events-none',
  '[&_textarea]:pointer-events-none',
  '[&_select]:pointer-events-none',
  '[&_label]:pointer-events-none',
  '[&_a]:pointer-events-none',
  '[&_[role=combobox]]:pointer-events-none',
  '[&_[role=checkbox]]:pointer-events-none',
  '[&_[role=switch]]:pointer-events-none',
  '[&_[role=radio]]:pointer-events-none',
].join(' ');
