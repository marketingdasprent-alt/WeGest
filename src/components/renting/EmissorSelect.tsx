import { useEffect } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';

interface EmissorSelectProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

/**
 * Seletor da empresa emissora (clientes tipo='empresa') de uma reserva/contrato.
 * Os documentos gerados usam os templates da empresa escolhida.
 * Org com uma única empresa: pré-selecciona automaticamente (sem fricção);
 * com várias, obriga a escolha explícita.
 */
export const EmissorSelect: React.FC<EmissorSelectProps> = ({ value, onChange, disabled }) => {
  const { empresas, loading } = useClientesEmpresas();

  useEffect(() => {
    if (!loading && empresas.length === 1 && !value) {
      onChange(empresas[0].id);
    }
  }, [loading, empresas, value, onChange]);

  if (loading) {
    return (
      <Select disabled>
        <SelectTrigger className="bg-background">
          <SelectValue placeholder="A carregar empresas..." />
        </SelectTrigger>
      </Select>
    );
  }

  if (empresas.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger className="bg-background">
          <SelectValue placeholder="Sem empresas registadas — cria um cliente de tipo Empresa" />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value ?? ''} onValueChange={(v) => onChange(v || null)} disabled={disabled}>
      <SelectTrigger className="bg-background">
        <SelectValue placeholder="Seleciona a empresa emissora..." />
      </SelectTrigger>
      <SelectContent>
        {empresas.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.nome}
            {e.nif ? ` · NIF ${e.nif}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
