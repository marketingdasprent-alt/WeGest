// ============================================================
// Dicionário de labels — vocabulário neutro / contextual
// ============================================================
// Permite que a mesma chave semântica ("cliente.singular") apareça com
// palavras diferentes consoante os módulos activos. Ex.: numa org só-TVDE
// "cliente" passa a "motorista parceiro"; numa só-aluguer mantém-se "cliente".
//
// Convenção da chave: `<dominio>.<forma>` → ex. `cliente.singular`,
// `cliente.plural`, `contrato.singular`. Sempre PT-PT.
//
// Esta tabela é a fonte. O hook `useLabel(key)` resolve a variante correcta
// com base nos módulos activos da organização.

import type { Modulo } from '@/types/modulo';

export interface LabelEntry {
  /** Texto por defeito quando nenhuma variante aplica. */
  default: string;
  /**
   * Variantes condicionais. A primeira regra que case com os módulos
   * activos da org é a aplicada. Avaliação top-down — declarar do mais
   * restritivo para o menos restritivo.
   */
  variants?: LabelVariant[];
}

export interface LabelVariant {
  /** Módulos que TÊM de estar activos para esta variante aplicar. */
  modules: Modulo[];
  /** Módulos que NÃO podem estar activos (módulo único). */
  excludeModules?: Modulo[];
  text: string;
}

export const LABELS: Record<string, LabelEntry> = {
  // -------- Cliente / Motorista --------
  'cliente.singular': {
    default: 'Cliente',
    variants: [{ modules: ['tvde'], excludeModules: ['aluguer'], text: 'Motorista parceiro' }],
  },
  'cliente.plural': {
    default: 'Clientes',
    variants: [{ modules: ['tvde'], excludeModules: ['aluguer'], text: 'Motoristas parceiros' }],
  },

  // -------- Contrato --------
  'contrato.singular': {
    default: 'Contrato',
  },
  'contrato.plural': {
    default: 'Contratos',
  },
  'contrato.novo': {
    default: 'Novo contrato',
    variants: [
      { modules: ['tvde'], excludeModules: ['aluguer'], text: 'Novo contrato de motorista' },
      { modules: ['aluguer'], excludeModules: ['tvde'], text: 'Novo contrato de aluguer' },
    ],
  },

  // -------- Reserva --------
  'reserva.singular': {
    default: 'Reserva',
  },
  'reserva.plural': {
    default: 'Reservas',
  },

  // -------- Viatura --------
  'viatura.singular': {
    default: 'Viatura',
  },
  'viatura.plural': {
    default: 'Viaturas',
  },
};

/**
 * Resolve a label dada a configuração de módulos da org.
 * Função pura — testável sem React. O hook `useLabel` envolve isto com
 * acesso ao estado de módulos via React Query.
 */
export function resolveLabel(key: string, activeModules: Set<Modulo>): string {
  const entry = LABELS[key];
  if (!entry) return key; // fallback visível para detectar chaves em falta

  if (entry.variants) {
    for (const variant of entry.variants) {
      const allRequired = variant.modules.every((m) => activeModules.has(m));
      const noneExcluded =
        !variant.excludeModules || variant.excludeModules.every((m) => !activeModules.has(m));
      if (allRequired && noneExcluded) return variant.text;
    }
  }

  return entry.default;
}
