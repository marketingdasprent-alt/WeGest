import type { UseFormReturn } from 'react-hook-form';
import { ContratoTabCobertura } from '@/components/renting/contratos/ContratoTabCobertura';
import type { ContratoFormValues } from '@/components/renting/contratos/contratoForm.schema';
import type { RentingCobertura } from '@/types/rentingCobertura';

interface ContratoTabCoberturasProps {
  form: UseFormReturn<ContratoFormValues>;
  coberturas: RentingCobertura[];
}

/**
 * Separador "Coberturas" do formulário de contrato renting.
 * Delega no ContratoTabCobertura (componente existente).
 */
export const ContratoTabCoberturas: React.FC<ContratoTabCoberturasProps> = ({
  form,
  coberturas,
}) => {
  return <ContratoTabCobertura form={form} coberturas={coberturas} />;
};
