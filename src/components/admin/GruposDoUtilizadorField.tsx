import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface GrupoOpcao {
  id: string;
  nome: string;
}

interface GruposDoUtilizadorFieldProps {
  grupos: GrupoOpcao[];
  principal: string | null;
  adicionais: string[];
  onChange: (principal: string | null, adicionais: string[]) => void;
}

/**
 * Os grupos de uma pessoa: um principal (o que decide a rota inicial e o
 * painel) e quantos adicionais forem precisos. As permissões somam-se.
 */
export const GruposDoUtilizadorField: React.FC<GruposDoUtilizadorFieldProps> = ({
  grupos,
  principal,
  adicionais,
  onChange,
}) => {
  const alternar = (id: string, marcado: boolean) => {
    const proximos = marcado ? [...adicionais, id] : adicionais.filter((a) => a !== id);
    onChange(principal, [...new Set(proximos)]);
  };

  // Mudar o principal para um grupo que era adicional tira-o dos adicionais.
  const mudarPrincipal = (id: string) =>
    onChange(
      id,
      adicionais.filter((a) => a !== id)
    );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="grupo" className="text-foreground">
          Grupo principal
        </Label>
        <Select value={principal || ''} onValueChange={mudarPrincipal}>
          <SelectTrigger className="bg-background border-border">
            <SelectValue placeholder="Selecionar grupo" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            {grupos.map((grupo) => (
              <SelectItem key={grupo.id} value={grupo.id}>
                {grupo.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Outros grupos</legend>
        <p className="text-xs text-muted-foreground">
          As permissões de todos os grupos somam-se. Marca os grupos que esta pessoa também tem.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {grupos
            .filter((g) => g.id !== principal)
            .map((grupo) => (
              <label
                key={grupo.id}
                htmlFor={`grupo-extra-${grupo.id}`}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <Checkbox
                  id={`grupo-extra-${grupo.id}`}
                  checked={adicionais.includes(grupo.id)}
                  onCheckedChange={(v) => alternar(grupo.id, v === true)}
                />
                {grupo.nome}
              </label>
            ))}
        </div>
      </fieldset>
    </div>
  );
};
