import type { UseFormReturn } from 'react-hook-form';
import { Fuel, Gauge, MapPin } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { MovimentoFormValues } from '../movimentoForm.schema';
import { COMBUSTIVEL_OPTIONS } from '../movimentosUtils';
import type { Estacao } from '@/hooks/useEstacoes';

const SENTINEL_NONE = '__none__';

interface MovimentoTabDetalhesProps {
  form: UseFormReturn<MovimentoFormValues>;
  estacoes: Estacao[];
}

/** Select de estação reutilizável. */
const EstacaoField: React.FC<{
  form: UseFormReturn<MovimentoFormValues>;
  name: 'estacao_origem_id' | 'estacao_destino_id';
  label: string;
  estacoes: Estacao[];
}> = ({ form, name, label, estacoes }) => (
  <FormField
    control={form.control}
    name={name}
    render={({ field }) => (
      <FormItem>
        <FormLabel>
          {label} <span className="text-destructive">*</span>
        </FormLabel>
        <Select
          value={field.value ?? SENTINEL_NONE}
          onValueChange={(v) => field.onChange(v === SENTINEL_NONE ? null : v)}
        >
          <FormControl>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Selecciona estação..." />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            <SelectItem value={SENTINEL_NONE}>— Sem estação —</SelectItem>
            {estacoes.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nome}
                {e.cidade ? ` · ${e.cidade}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormMessage />
      </FormItem>
    )}
  />
);

/** Campo numérico opcional (KM). */
const NumberField: React.FC<{
  form: UseFormReturn<MovimentoFormValues>;
  name: 'km_inicial' | 'km_final';
  label: string;
  suffix: string;
  step?: string;
  icon?: React.ComponentType<{ className?: string }>;
}> = ({ form, name, label, suffix, step, icon: Icon }) => (
  <FormField
    control={form.control}
    name={name}
    render={({ field }) => (
      <FormItem>
        <FormLabel className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </FormLabel>
        <div className="relative">
          <FormControl>
            <Input
              type="number"
              min={0}
              step={step}
              placeholder="—"
              className="bg-background pr-12"
              value={field.value ?? ''}
              onChange={(e) =>
                field.onChange(e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </FormControl>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        </div>
        <FormMessage />
      </FormItem>
    )}
  />
);

/** Select de combustível em oitavos. */
const CombustivelField: React.FC<{
  form: UseFormReturn<MovimentoFormValues>;
  name: 'combustivel_inicial' | 'combustivel_final';
  label: string;
}> = ({ form, name, label }) => (
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
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Nível de combustível..." />
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

export const MovimentoTabDetalhes: React.FC<MovimentoTabDetalhesProps> = ({ form, estacoes }) => (
  <div className="space-y-8">
    {/* Trajeto */}
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b">
        <MapPin className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold">Trajeto da Transferência</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EstacaoField
          form={form}
          name="estacao_origem_id"
          label="Estação de Origem"
          estacoes={estacoes}
        />
        <EstacaoField
          form={form}
          name="estacao_destino_id"
          label="Estação de Destino"
          estacoes={estacoes}
        />
      </div>
    </div>

    {/* Quilometragem & Combustível */}
    <div className="rounded-lg border bg-gradient-to-br from-muted/40 to-muted/10 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Gauge className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold">Quilometragem & Combustível</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <NumberField form={form} name="km_inicial" label="KM Inicial" suffix="km" icon={Gauge} />
        <NumberField form={form} name="km_final" label="KM Final" suffix="km" icon={Gauge} />
        <CombustivelField form={form} name="combustivel_inicial" label="Combustível Inicial" />
        <CombustivelField form={form} name="combustivel_final" label="Combustível Final" />
      </div>
    </div>
  </div>
);
