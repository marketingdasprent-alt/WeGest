import { FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import { DocumentUploader } from '@/components/motorista-portal/DocumentUploader';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { Control } from 'react-hook-form';
import type { Motorista } from '@/pages/Motoristas';

interface LicencaTvdeSectionProps {
  control: Control;
  motorista: Motorista;
}

export function LicencaTvdeSection({ control, motorista }: LicencaTvdeSectionProps) {
  return (
    <SectionCard
      icon={<FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
      title="Licença TVDE"
      headerClassName="bg-amber-50 dark:bg-amber-950/30 border-b"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={control}
          name="licenca_tvde_numero"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número da Licença</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="licenca_tvde_validade"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Validade</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="pt-2 sm:col-span-2">
          <FormField
            control={control}
            name="licenca_tvde_ficheiro_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Ficheiro da Licença TVDE</FormLabel>
                <FormControl>
                  <DocumentUploader
                    folder="tvde"
                    motoristaId={motorista.id}
                    currentUrl={field.value}
                    onUpload={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </SectionCard>
  );
}
