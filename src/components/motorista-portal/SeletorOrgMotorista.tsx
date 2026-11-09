import { Building2, ChevronDown } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useOrgsMotorista } from '@/hooks/useOrgsMotorista';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Troca de empresa no portal do motorista, para quem trabalha (ou trabalhou)
 * para mais de uma. Cada empresa mostra o seu contrato, resumos e dívidas: a
 * troca só muda a org ativa, e o isolamento por org faz o resto.
 */
export function SeletorOrgMotorista() {
  const { user } = useAuth();
  const { orgId, orgs, switchOrg } = useTenant();
  const { data: orgsMotorista = [] } = useOrgsMotorista(user?.id);

  // Só fichas ativas, e só empresas a que a conta pertence (o switchOrg recusa as outras).
  const opcoes = orgsMotorista.filter((o) => o.fichaAtiva && orgs.some((m) => m.id === o.orgId));
  if (opcoes.length <= 1) return null;

  const atual = opcoes.find((o) => o.orgId === orgId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex max-w-[150px] items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
          aria-label="Escolher empresa"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{atual?.nome ?? 'Empresa'}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {opcoes.map((o) => (
          <DropdownMenuItem
            key={o.orgId}
            onClick={() => {
              if (o.orgId !== orgId) void switchOrg(o.orgId);
            }}
            className={cn(
              'flex cursor-pointer items-center gap-2',
              o.orgId === orgId && 'bg-primary/10 font-medium text-primary'
            )}
          >
            <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">{o.nome}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
