import type { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DocumentUploader } from '@/components/motorista-portal/DocumentUploader';
import { CATEGORIAS_CARTA, type FormValues } from './motoristaDialog.schema';

interface MotoristaFormDocumentosProps {
  form: UseFormReturn<FormValues>;
  motoristaId: string | undefined;
}

export function MotoristaFormDocumentos({ form, motoristaId }: MotoristaFormDocumentosProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Identificação - AZUL */}
      <div className="bg-blue-100/40 dark:bg-blue-900/20 p-6 rounded-2xl border-2 border-blue-200 dark:border-blue-800/50 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 pb-2 border-b border-blue-300/50 dark:border-blue-800/50">
          <h3 className="font-bold text-blue-800 dark:text-blue-300">Identificação</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="documento_tipo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Tipo <span className="text-red-500">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Cartão Cidadão">Cartão Cidadão</SelectItem>
                    <SelectItem value="Passaporte">Passaporte</SelectItem>
                    <SelectItem value="Autorização de Residência">AR</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="documento_numero"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Número <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Número" {...field} className="bg-background" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="documento_validade"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Validade</FormLabel>
              <FormControl>
                <Input type="date" {...field} className="bg-background" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="documento_ficheiro_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Frente</FormLabel>
                <FormControl>
                  <DocumentUploader
                    folder="documentos"
                    motoristaId={motoristaId}
                    currentUrl={field.value ?? null}
                    onUpload={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="documento_identificacao_verso_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Verso</FormLabel>
                <FormControl>
                  <DocumentUploader
                    folder="documentos"
                    motoristaId={motoristaId}
                    currentUrl={field.value ?? null}
                    onUpload={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Carta de Condução - VERDE */}
      <div className="bg-emerald-100/40 dark:bg-emerald-900/20 p-6 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800/50 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 pb-2 border-b border-emerald-300/50 dark:border-emerald-800/50">
          <h3 className="font-bold text-emerald-800 dark:text-emerald-300">Carta de Condução</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="carta_conducao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Número <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Número" {...field} className="bg-background" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="carta_validade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Validade</FormLabel>
                <FormControl>
                  <Input type="date" {...field} className="bg-background" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="carta_ficheiro_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Frente</FormLabel>
                <FormControl>
                  <DocumentUploader
                    folder="cartas"
                    motoristaId={motoristaId}
                    currentUrl={field.value ?? null}
                    onUpload={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="carta_conducao_verso_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Verso</FormLabel>
                <FormControl>
                  <DocumentUploader
                    folder="cartas"
                    motoristaId={motoristaId}
                    currentUrl={field.value ?? null}
                    onUpload={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="carta_categorias"
          render={() => (
            <FormItem>
              <FormLabel>Categorias</FormLabel>
              <div className="grid grid-cols-5 gap-2">
                {CATEGORIAS_CARTA.map((categoria) => (
                  <FormField
                    key={categoria}
                    control={form.control}
                    name="carta_categorias"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(categoria)}
                            onCheckedChange={(checked) => {
                              const current = field.value || [];
                              return checked
                                ? field.onChange([...current, categoria])
                                : field.onChange(current.filter((value) => value !== categoria));
                            }}
                          />
                        </FormControl>
                        <FormLabel className="text-xs font-normal cursor-pointer">
                          {categoria}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </FormItem>
          )}
        />
      </div>

      {/* TVDE - ROXO */}
      <div className="bg-indigo-100/40 dark:bg-indigo-900/20 p-6 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800/50 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 pb-2 border-b border-indigo-300/50 dark:border-indigo-800/50">
          <h3 className="font-bold text-indigo-800 dark:text-indigo-300">Licença TVDE</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="licenca_tvde_numero"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número</FormLabel>
                <FormControl>
                  <Input placeholder="Número" {...field} className="bg-background" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="licenca_tvde_validade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Validade</FormLabel>
                <FormControl>
                  <Input type="date" {...field} className="bg-background" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="licenca_tvde_ficheiro_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Ficheiro TVDE</FormLabel>
              <FormControl>
                <DocumentUploader
                  folder="tvde"
                  motoristaId={motoristaId}
                  currentUrl={field.value ?? null}
                  onUpload={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Adicional - LARANJA */}
      <div className="bg-amber-100/40 dark:bg-amber-900/20 p-6 rounded-2xl border-2 border-amber-200 dark:border-amber-800/50 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 pb-2 border-b border-amber-300/50 dark:border-amber-800/50">
          <h3 className="font-bold text-amber-800 dark:text-amber-300">Documentação Extra</h3>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <FormField
            control={form.control}
            name="registo_criminal_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Registo Criminal</FormLabel>
                <FormControl>
                  <DocumentUploader
                    folder="documentos"
                    motoristaId={motoristaId}
                    currentUrl={field.value ?? null}
                    onUpload={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="comprovativo_morada_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Comprovativo de Morada</FormLabel>
                <FormControl>
                  <DocumentUploader
                    folder="documentos"
                    motoristaId={motoristaId}
                    currentUrl={field.value ?? null}
                    onUpload={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="comprovativo_iban_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Comprovativo de IBAN</FormLabel>
                <FormControl>
                  <DocumentUploader
                    folder="documentos"
                    motoristaId={motoristaId}
                    currentUrl={field.value ?? null}
                    onUpload={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
}
