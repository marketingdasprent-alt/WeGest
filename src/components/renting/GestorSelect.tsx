import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGestoresTvde } from '@/hooks/useGestoresTvde';

const SENTINEL_NONE = '__none__';

interface GestorSelectProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

/**
 * Seletor do gestor responsável (cargo "Gestor TVDE") de uma reserva/contrato.
 * Base da privacidade por gestor — reatribuição feita por superiores. Mostra
 * por nome/email; guarda o profiles.id. Inclui "Nenhum" (só superiores veem).
 */
export const GestorSelect: React.FC<GestorSelectProps> = ({ value, onChange, disabled }) => {
  const { data: gestores = [], isLoading } = useGestoresTvde();

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger className="bg-background">
          <SelectValue placeholder="A carregar gestores..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select
      value={value ?? SENTINEL_NONE}
      onValueChange={(v) => {
        if (!v) return;
        onChange(v === SENTINEL_NONE ? null : v);
      }}
      disabled={disabled}
    >
      <SelectTrigger className="bg-background">
        <SelectValue placeholder="Sem gestor atribuído" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SENTINEL_NONE}>Sem gestor</SelectItem>
        {gestores.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            {g.nome}
            {g.email ? ` · ${g.email}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
