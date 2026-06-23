import type React from 'react';

import { FormControl, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { Estacao } from '@/hooks/useEstacoes';
import { SENTINEL_NONE } from './contratoFormConstants';

interface EstacaoSelectFieldProps {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  estacoes: Estacao[];
  label?: string;
  placeholder?: string;
}

export const EstacaoSelectField: React.FC<EstacaoSelectFieldProps> = ({
  value,
  onChange,
  estacoes,
  label = 'Estação',
  placeholder = 'Sem estação',
}) => (
  <FormItem>
    <FormLabel>{label}</FormLabel>
    <Select
      value={value ?? SENTINEL_NONE}
      onValueChange={(v) => {
        if (!v) return;
        onChange(v === SENTINEL_NONE ? null : v);
      }}
    >
      <FormControl>
        <SelectTrigger className="bg-background">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectItem value={SENTINEL_NONE}>— Sem estação —</SelectItem>
        {estacoes.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <FormMessage />
  </FormItem>
);
