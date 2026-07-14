import type { Motorista } from '@/types/motorista';

/**
 * Campos obrigatórios da ficha do motorista — mesmos exigidos no formulário
 * (MotoristaTabDados). Um motorista com algum destes em falta tem "ficha
 * incompleta" e aparece no badge "sem documentos" da lista de motoristas.
 */
export const CAMPOS_FICHA_OBRIGATORIOS: Array<{ campo: keyof Motorista; label: string }> = [
  { campo: 'nif', label: 'NIF' },
  { campo: 'email', label: 'Email' },
  { campo: 'iban', label: 'IBAN' },
  { campo: 'telefone', label: 'Telefone' },
  { campo: 'documento_tipo', label: 'Tipo de documento' },
  { campo: 'documento_numero', label: 'Nº documento' },
  { campo: 'documento_validade', label: 'Validade documento' },
];

/** Lista os labels dos campos obrigatórios em falta neste motorista (vazio = ficha completa). */
export function camposFichaEmFalta(motorista: Motorista): string[] {
  return CAMPOS_FICHA_OBRIGATORIOS.filter(({ campo }) => {
    const v = motorista[campo];
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  }).map(({ label }) => label);
}
