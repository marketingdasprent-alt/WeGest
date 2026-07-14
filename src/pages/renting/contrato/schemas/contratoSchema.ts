/**
 * Schemas Zod do formulário de contrato renting.
 * Re-exporta do schema central em components/renting/contratos/
 * para manter a fonte de verdade única.
 */
export {
  contratoFormSchema,
  DEFAULT_CONTRATO_VALUES,
  isoToLocalInput,
  localInputToIso,
} from '@/components/renting/contratos/contratoForm.schema';

export type { ContratoFormValues } from '@/components/renting/contratos/contratoForm.schema';
