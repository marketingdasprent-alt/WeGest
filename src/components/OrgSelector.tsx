import React from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface OrgSelectorProps {
  className?: string;
}

export const OrgSelector: React.FC<OrgSelectorProps> = ({ className }) => {
  const { orgId, orgNome, orgs, switchOrg, loading } = useTenant();

  // Não mostrar se só tem uma org ou nenhuma
  if (loading || orgs.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
            'bg-primary/10 text-primary hover:bg-primary/15 transition-colors',
            'border border-primary/20',
            className
          )}
        >
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate max-w-[140px]">{orgNome || 'Selecionar org'}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => {
              if (org.id !== orgId) void switchOrg(org.id);
            }}
            className={cn(
              'flex items-center gap-2 cursor-pointer',
              org.id === orgId && 'bg-primary/10 text-primary font-medium'
            )}
          >
            <Building2 className="h-4 w-4 shrink-0" />
            <span>{org.nome}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
