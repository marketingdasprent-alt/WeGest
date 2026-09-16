import type { Modulo } from '@/types/modulo';

export interface LabelEntry {
  default: string;
  variants?: LabelVariant[];
}

export interface LabelVariant {
  modules: Modulo[];
  excludeModules?: Modulo[];
  text: string;
}

export const LABELS: Record<string, LabelEntry> = {
  'cliente.singular': {
    default: 'Cliente',
    variants: [{ modules: ['tvde'], excludeModules: ['aluguer'], text: 'Motorista parceiro' }],
  },
  'cliente.plural': {
    default: 'Clientes',
    variants: [{ modules: ['tvde'], excludeModules: ['aluguer'], text: 'Motoristas parceiros' }],
  },

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

  'reserva.singular': {
    default: 'Reserva',
  },
  'reserva.plural': {
    default: 'Reservas',
  },

  'viatura.singular': {
    default: 'Viatura',
  },
  'viatura.plural': {
    default: 'Viaturas',
  },
};

export function resolveLabel(key: string, activeModules: Set<Modulo>): string {
  const entry = LABELS[key];
  if (!entry) return key;

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
