/**
 * Constantes para ContratoForm
 * Valores, opções e configurações reutilizáveis
 */

export const SENTINEL_NONE = '__none__';

export const ESTADO_OP_OPTIONS = [
  { value: 'agendado', label: 'Agendado' },
  { value: 'em_curso', label: 'Em Curso' },
  { value: 'devolvido', label: 'Devolvido' },
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
