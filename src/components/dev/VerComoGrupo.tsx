import { Eye, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermissionsContext } from '@/contexts/PermissionsContext';
import { useOrgId } from '@/contexts/TenantContext';
import { useCargosPrevisiveis } from '@/hooks/useCargosPrevisiveis';
import { guardarVerComoGrupo } from '@/lib/verComoGrupo';
import { cn } from '@/lib/utils';

const EU = 'eu';

interface VerComoGrupoProps {
  /** Injectável nos testes; por omissão recarrega a página. */
  onMudou?: () => void;
}

/** Só em `pnpm dev`: o admin escolhe um grupo e a app passa a comportar-se como ele. */
export function VerComoGrupo({ onMudou = () => window.location.reload() }: VerComoGrupoProps) {
  const { isAdmin, verComo, loading } = usePermissionsContext();
  const orgId = useOrgId();
  // Durante a pré-visualização isAdmin é false — o verComo é o que prova que és admin.
  const adminReal = isAdmin || !!verComo;
  const { data: cargos = [] } = useCargosPrevisiveis(orgId, adminReal);

  if (loading || !adminReal || !orgId) return null;

  const escolher = (valor: string) => {
    guardarVerComoGrupo(orgId, valor === EU ? null : valor);
    // Recarregar: menus, rotas e caches voltam a ser calculados do zero para o grupo.
    onMudou();
  };

  return (
    <div
      className={cn(
        'fixed bottom-3 left-3 z-[60] flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-lg',
        verComo
          ? 'border-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-900 dark:text-amber-50'
          : 'bg-background/95 text-muted-foreground'
      )}
    >
      <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">Ver como</span>
      <Select value={verComo?.id ?? EU} onValueChange={escolher}>
        <SelectTrigger
          aria-label="Ver como grupo"
          className="h-6 w-auto gap-1 border-0 bg-transparent px-1 text-xs font-medium shadow-none focus:ring-0"
        >
          <SelectValue placeholder={verComo?.nome ?? 'Eu (admin)'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EU}>Eu (admin)</SelectItem>
          {cargos.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {verComo && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded-full"
          aria-label="Sair da pré-visualização"
          onClick={() => escolher(EU)}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
