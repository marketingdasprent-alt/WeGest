import type React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Building2 } from 'lucide-react';

import { FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { EmissorSelect } from '@/components/renting/EmissorSelect';
import { GestorSelect } from '@/components/renting/GestorSelect';
import { usePermissions } from '@/hooks/usePermissions';
import { SectionHeader } from '@/components/renting/reservas/SectionHeader';

import type { ContratoFormValues } from './contratoForm.schema';

interface SectionEmpresaEmissoraProps {
  form: UseFormReturn<ContratoFormValues>;
}

export const SectionEmpresaEmissora: React.FC<SectionEmpresaEmissoraProps> = ({ form }) => {
  const { podeVerTodosRenting } = usePermissions();
  return (
    <div>
      <SectionHeader
        icon={Building2}
        title="Empresa Emissora"
        accent="sky"
        required
        hint="Os documentos do contrato usam os templates desta empresa"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="emissor_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">Empresa emissora</FormLabel>
              <EmissorSelect value={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
        {podeVerTodosRenting && (
          <FormField
            control={form.control}
            name="gestor_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gestor responsável</FormLabel>
                <GestorSelect value={field.value} onChange={field.onChange} />
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
    </div>
  );
};
