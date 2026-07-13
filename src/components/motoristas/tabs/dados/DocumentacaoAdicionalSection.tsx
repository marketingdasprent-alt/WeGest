import { FileText } from 'lucide-react';
import { SectionCard } from '@/components/ui/section-card';
import { DocumentUploader } from '@/components/motorista-portal/DocumentUploader';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { Control } from 'react-hook-form';
import type { Motorista } from '@/pages/Motoristas';

interface DocumentacaoAdicionalSectionProps {
  control: Control;
  motorista: Motorista;
}

export function DocumentacaoAdicionalSection({
  control,
  motorista,
}: DocumentacaoAdicionalSectionProps) {
  return (
    <SectionCard
      icon={<FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
      title="Documentação Adicional"
      headerClassName="bg-rose-50 dark:bg-rose-950/30 border-b"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField
          control={control}
          name="registo_criminal_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Registo Criminal</FormLabel>
              <FormControl>
                <DocumentUploader
                  folder="documentos"
                  motoristaId={motorista.id}
                  currentUrl={field.value}
                  onUpload={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="comprovativo_morada_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Comprovativo Morada</FormLabel>
              <FormControl>
                <DocumentUploader
                  folder="documentos"
                  motoristaId={motorista.id}
                  currentUrl={field.value}
                  onUpload={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="comprovativo_iban_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Comprovativo IBAN</FormLabel>
              <FormControl>
                <DocumentUploader
                  folder="documentos"
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
    </SectionCard>
  );
}
