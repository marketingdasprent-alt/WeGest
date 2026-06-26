import { useState } from 'react';
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
import { Label } from '@/components/ui/label';
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
const SENTINEL_AUTO = '__auto__';

/** Opções para o gestor escolher o tipo quando a viatura não o tem definido. */
const TIPO_COMBUSTIVEL_OPCOES = [
  'Gasolina',
  'Diesel',
  'Elétrico',
  'Híbrido',
  'GPL',
  'Bi-Fuel - Gasolina/GPL',
] as const;

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

/** Infere o tipo a partir dos níveis já preenchidos (útil na edição). */
function inferirTipo(v: MovimentoFormValues): string | null {
  if (v.eletricidade_inicial || v.eletricidade_final) return 'eletrico';
  if (v.gpl_inicial || v.gpl_final) return 'gpl';
  if (v.combustivel_inicial != null || v.combustivel_final != null) return 'gasolina';
  return null;
}

/** Campos de energia (combustível/bateria/GPL) adaptados ao tipo — com escolha manual. */
export function NivelEnergiaFields({ form, tipoCombustivel }: NivelEnergiaFieldsProps) {
  // O gestor pode escolher o tipo manualmente quando a viatura não o tem definido.
  const [override, setOverride] = useState<string | null>(null);
  const autoOuInferido = tipoCombustivel ?? inferirTipo(form.getValues());
  const efetivo = override ?? autoOuInferido;

  const mostraCombustivel = precisaCombustivel(efetivo);
  const mostraEletrico = precisaEletrico(efetivo);
  const mostraGpl = precisaGpl(efetivo);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          <Fuel className="h-3.5 w-3.5" />
          Tipo de combustível
        </Label>
        <Select
          value={override ?? SENTINEL_AUTO}
          onValueChange={(v) => setOverride(v === SENTINEL_AUTO ? null : v)}
        >
          <SelectTrigger className="bg-background h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SENTINEL_AUTO}>
              Automático{autoOuInferido ? ` — ${autoOuInferido}` : ' — não detetado'}
            </SelectItem>
            {TIPO_COMBUSTIVEL_OPCOES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!autoOuInferido && !override && (
          <p className="text-xs text-muted-foreground">
            Esta viatura não tem combustível definido — escolhe aqui (ou define na ficha da
            viatura).
          </p>
        )}
      </div>
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
