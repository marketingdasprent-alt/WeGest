import type { UseFormReturn } from 'react-hook-form';
import { Battery, Fuel, Zap } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import type { MovimentoFormValues } from './movimentoForm.schema';
import { COMBUSTIVEL_OPTIONS } from './movimentosUtils';
import {
  precisaCombustivel,
  precisaEletrico,
  precisaGpl,
  ELETRICO_OPTS,
  GPL_OPTS,
} from '@/utils/combustivel';

const SENTINEL_NONE = '__none__';

type CombustivelFieldName = 'combustivel_inicial' | 'combustivel_final';
type TextoFieldName = 'eletricidade_inicial' | 'eletricidade_final' | 'gpl_inicial' | 'gpl_final';

/** Combustão em oitavos (0–8) — guarda número. */
function CombustivelOitavosField({
  form,
  name,
  label,
}: {
  form: UseFormReturn<MovimentoFormValues>;
  name: CombustivelFieldName;
  label: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            <Fuel className="h-3.5 w-3.5" />
            {label}
          </FormLabel>
          <Select
            value={field.value == null ? SENTINEL_NONE : String(field.value)}
            onValueChange={(v) => field.onChange(v === SENTINEL_NONE ? null : Number(v))}
          >
            <FormControl>
              <SelectTrigger className="bg-background h-9">
                <SelectValue placeholder="—" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={SENTINEL_NONE}>— Não registado —</SelectItem>
              {COMBUSTIVEL_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Nível em texto (bateria %, GPL) — botões; guarda string. */
function NivelTextoField({
  form,
  name,
  label,
  icon,
  opts,
}: {
  form: UseFormReturn<MovimentoFormValues>;
  name: TextoFieldName;
  label: string;
  icon: React.ReactNode;
  opts: readonly string[];
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            {icon}
            {label}
          </FormLabel>
          <div className="flex rounded-md border border-input overflow-hidden h-9">
            {opts.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => field.onChange(field.value === opt ? null : opt)}
                className={cn(
                  'flex-1 text-[10px] font-medium transition-colors border-r border-input last:border-r-0',
                  field.value === opt
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-muted text-foreground'
                )}
              >
                {opt === 'Vazio' ? <Zap className="h-3 w-3 mx-auto opacity-50" /> : opt}
              </button>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface NivelEnergiaFieldsProps {
  form: UseFormReturn<MovimentoFormValues>;
  /** Tipo de combustível da viatura selecionada (ex.: 'gasolina', 'eletrico', 'hibrido'). */
  tipoCombustivel: string | null | undefined;
}

/** Campos de energia (combustível/bateria/GPL, inicial+final) adaptados ao tipo da viatura. */
export function NivelEnergiaFields({ form, tipoCombustivel }: NivelEnergiaFieldsProps) {
  const mostraCombustivel = precisaCombustivel(tipoCombustivel);
  const mostraEletrico = precisaEletrico(tipoCombustivel);
  const mostraGpl = precisaGpl(tipoCombustivel);

  return (
    <div className="space-y-3">
      {mostraCombustivel && (
        <div className="grid grid-cols-2 gap-3">
          <CombustivelOitavosField
            form={form}
            name="combustivel_inicial"
            label="Combustível Inicial"
          />
          <CombustivelOitavosField form={form} name="combustivel_final" label="Combustível Final" />
        </div>
      )}
      {mostraEletrico && (
        <div className="grid grid-cols-2 gap-3">
          <NivelTextoField
            form={form}
            name="eletricidade_inicial"
            label="Bateria Inicial"
            icon={<Battery className="h-3.5 w-3.5 text-green-500" />}
            opts={ELETRICO_OPTS}
          />
          <NivelTextoField
            form={form}
            name="eletricidade_final"
            label="Bateria Final"
            icon={<Battery className="h-3.5 w-3.5 text-green-500" />}
            opts={ELETRICO_OPTS}
          />
        </div>
      )}
      {mostraGpl && (
        <div className="grid grid-cols-2 gap-3">
          <NivelTextoField
            form={form}
            name="gpl_inicial"
            label="GPL Inicial"
            icon={<Zap className="h-3.5 w-3.5 text-orange-500" />}
            opts={GPL_OPTS}
          />
          <NivelTextoField
            form={form}
            name="gpl_final"
            label="GPL Final"
            icon={<Zap className="h-3.5 w-3.5 text-orange-500" />}
            opts={GPL_OPTS}
          />
        </div>
      )}
    </div>
  );
}
