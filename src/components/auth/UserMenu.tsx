import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Building2, LogOut, Settings, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const UserMenu = () => {
  const { user, signOut } = useAuth();
  const { isAdmin, hasAccessToResource } = usePermissions();
  const navigate = useNavigate();

  if (!user) return null;

  const displayName = user.user_metadata?.nome || user.email?.split('@')[0] || 'Utilizador';
  const canViewOrg = isAdmin || hasAccessToResource(RECURSOS.ADMIN_MINHA_ORGANIZACAO);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* O nome só aparece a partir de sm: abaixo disso o botão fica apenas
            com o ícone e ficava sem nome acessível. O aria-label vale nos dois
            casos e não depende do breakpoint. */}
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sm text-foreground hover:bg-primary/20 hover:text-foreground px-3"
          aria-label={`Conta de ${displayName}`}
        >
          <User className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card border-border" align="end">
        <DropdownMenuLabel className="text-foreground">Minha Conta</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem
          onClick={() => navigate('/my-account')}
          className="text-foreground hover:bg-muted cursor-pointer"
        >
          <Settings className="h-4 w-4 mr-2" />
          Configurações
        </DropdownMenuItem>
        {canViewOrg && (
          <DropdownMenuItem
            onClick={() => navigate('/minha-organizacao')}
            className="text-foreground hover:bg-muted cursor-pointer"
          >
            <Building2 className="h-4 w-4 mr-2" />
            Minha Organização
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={signOut}
          className="text-foreground hover:bg-muted cursor-pointer"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
