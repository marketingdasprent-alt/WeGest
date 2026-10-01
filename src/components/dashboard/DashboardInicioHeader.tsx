import { LayoutDashboard, LifeBuoy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTiLinkPublico, useTiTicketsAbertos } from '@/hooks/useTiTickets';
import { linkListaTickets } from '@/lib/ticketsUrl';
import { RECURSOS } from '@/utils/permissions';
import { cn } from '@/lib/utils';

interface DashboardInicioHeaderProps {
  /** Grupo a que esta dashboard pertence — aparece como etiqueta ao lado do título. */
  perfil?: string;
  /** Só as dashboards que sabem recarregar-se mostram o botão de atualizar. */
  onAtualizar?: () => void;
  atualizando?: boolean;
  className?: string;
}

/**
 * Cabeçalho comum às três dashboards de /dashboard (frota, financeiro,
 * assistência). Existe para que todas tenham o mesmo título, os mesmos botões
 * e o mesmo comportamento — antes cada uma trazia o seu.
 */
export function DashboardInicioHeader({
  perfil,
  onAtualizar,
  atualizando = false,
  className,
}: DashboardInicioHeaderProps) {
  const { toast } = useToast();
  // Link público de pedidos de informática da própria organização. Abre em
  // separador novo porque o objectivo é poder ser partilhado com quem não tem
  // conta no WeGest.
  const { data: tiToken } = useTiLinkPublico();
  const { isAdmin, canEdit } = usePermissions();
  // Mesma condição que decide quem vê a lista de pedidos em TicketsTI. Mostrar
  // o número a quem não pode abrir a lista seria dar um aviso sobre algo que
  // essa pessoa não consegue ir ver.
  const podeGerirTickets = isAdmin || canEdit(RECURSOS.TI_TICKETS_GERIR);
  const { data: ticketsPorResolver = 0 } = useTiTicketsAbertos(podeGerirTickets);

  const abrirTicketsTI = () => {
    if (!tiToken) {
      toast({
        title: 'Link de pedidos indisponível',
        description: 'A organização ainda não tem link de pedidos de informática.',
        variant: 'destructive',
      });
      return;
    }
    window.open(linkListaTickets(tiToken), '_blank', 'noopener,noreferrer');
  };

  return (
    <StickyPageHeader
      icon={LayoutDashboard}
      className={className}
      title={
        <>
          Início
          {perfil && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {perfil}
            </span>
          )}
        </>
      }
    >
      {onAtualizar && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onAtualizar}
          disabled={atualizando}
          title="Atualizar"
        >
          <RefreshCw className={cn('h-4 w-4', atualizando && 'animate-spin')} />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={abrirTicketsTI}
        title={
          ticketsPorResolver > 0
            ? `Pedidos de informática — ${ticketsPorResolver} por resolver`
            : 'Pedidos de informática'
        }
      >
        <LifeBuoy className="h-4 w-4" />
        {/* Em baixo do ícone, e não em cima como no sino: os dois avisos
            vivem no mesmo cabeçalho e a posição é o que os distingue de
            relance. */}
        {ticketsPorResolver > 0 && (
          <span
            aria-label={`${ticketsPorResolver} pedidos de informática por resolver`}
            className="absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground"
          >
            {ticketsPorResolver > 99 ? '99+' : ticketsPorResolver}
          </span>
        )}
      </Button>
      <ThemeToggle />
    </StickyPageHeader>
  );
}
