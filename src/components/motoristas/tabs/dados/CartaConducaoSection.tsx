import { Car } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SectionCard } from '@/components/ui/section-card';
import { DocumentUploader } from '@/components/motorista-portal/DocumentUploader';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { Control } from 'react-hook-form';
import type { Motorista } from '@/pages/Motoristas';

interface CartaConducaoSectionProps {
  control: Control;
  motorista: Motorista;
}

const CARTA_CATEGORIAS = ['AM', 'A1', 'A2', 'A', 'B1', 'B', 'BE', 'C1', 'C', 'CE', 'D1', 'D', 'DE'];

export function CartaConducaoSection({ control, motorista }: CartaConducaoSectionProps) {
  return (
    <SectionCard
      icon={<Car className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
      title="Carta de Condução"
      headerClassName="bg-sky-50 dark:bg-sky-950/30 border-b"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={control}
          name="carta_conducao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número da Carta</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="carta_validade"
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
        <div className="pt-2">
          <FormField
            control={control}
            name="carta_ficheiro_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Carta de Condução (Frente)</FormLabel>
                <FormControl>
                  <DocumentUploader
                    folder="cartas"
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
            name="carta_conducao_verso_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Verso da Carta</FormLabel>
                <FormControl>
                  <DocumentUploader
                    folder="cartas"
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
        <FormField
          control={control}
          name="carta_categorias"
          render={() => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Categorias</FormLabel>
              <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-background">
                {CARTA_CATEGORIAS.map((cat) => (
                  <FormField
                    key={cat}
                    control={control}
                    name="carta_categorias"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-1 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(cat)}
                            onCheckedChange={(checked) => {
                              const current = field.value || [];
                              if (checked) {
                                field.onChange([...current, cat]);
                              } else {
                                field.onChange(current.filter((c: string) => c !== cat));
                              }
                            }}
                          />
                        </FormControl>
                        <FormLabel className="text-xs font-normal cursor-pointer">
                          {cat}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </SectionCard>
  );
}
