import { CreditCard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import { DocumentUploader } from '@/components/motorista-portal/DocumentUploader';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Control } from 'react-hook-form';
import type { Motorista } from '@/pages/Motoristas';

interface DocumentoIdentificacaoSectionProps {
  control: Control;
  motorista: Motorista;
}

export function DocumentoIdentificacaoSection({ control, motorista }: DocumentoIdentificacaoSectionProps) {
  return (
    <SectionCard
      icon={<CreditCard className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
      title="Documento de Identificação"
      headerClassName="bg-violet-50 dark:bg-violet-950/30 border-b"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={control}
          name="documento_tipo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Documento <span className="text-red-500">*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Cartão de Cidadão">Cartão de Cidadão</SelectItem>
                  <SelectItem value="Bilhete de Identidade">Bilhete de Identidade</SelectItem>
                  <SelectItem value="Passaporte">Passaporte</SelectItem>
                  <SelectItem value="Título de Residência">Título de Residência</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="documento_numero"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nº do Documento <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="documento_validade"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Validade <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="pt-2">
          <FormField
            control={control}
            name="documento_ficheiro_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Documento (Frente)</FormLabel>
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
        <div className="pt-2">
          <FormField
            control={control}
            name="documento_identificacao_verso_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Documento (Verso)</FormLabel>
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
      </div>
    </SectionCard>
  );
}
