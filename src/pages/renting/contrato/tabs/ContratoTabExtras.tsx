import type { UseFormReturn } from 'react-hook-form';
import { ContratoTabExtras as ContratoTabExtrasComponent } from '@/components/renting/contratos/ContratoTabExtras';
import type { ContratoFormValues } from '@/components/renting/contratos/contratoForm.schema';
import type { RentingExtra } from '@/types/rentingExtra';

interface ContratoTabExtrasProps {
  form: UseFormReturn<ContratoFormValues>;
  extras: RentingExtra[];
}

/**
 * Separador "Extras" do formulário de contrato renting.
 * Delega no ContratoTabExtras (componente existente).
 */
export const ContratoTabExtras: React.FC<ContratoTabExtrasProps> = ({ form, extras }) => {
  return <ContratoTabExtrasComponent form={form} extras={extras} />;
};
