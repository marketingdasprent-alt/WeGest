import type { UseFormReturn } from 'react-hook-form';
import { ContratoTabTaxas as ContratoTabTaxasComponent } from '@/components/renting/contratos/ContratoTabTaxas';
import type { ContratoFormValues } from '@/components/renting/contratos/contratoForm.schema';
import type { RentingTaxa } from '@/types/rentingTaxa';

interface ContratoTabTaxasProps {
  form: UseFormReturn<ContratoFormValues>;
  taxas: RentingTaxa[];
}

/**
 * Separador "Taxas" do formulário de contrato renting.
 * Delega no ContratoTabTaxas (componente existente).
 */
export const ContratoTabTaxas: React.FC<ContratoTabTaxasProps> = ({
  form,
  taxas,
}) => {
  return <ContratoTabTaxasComponent form={form} taxas={taxas} />;
};
