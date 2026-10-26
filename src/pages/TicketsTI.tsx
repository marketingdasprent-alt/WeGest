import { useNavigate, useParams } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { TiCaixaPedidos } from '@/components/ti/TiCaixaPedidos';
import { TiTicketFormulario } from '@/components/ti/TiTicketFormulario';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { tokenDoDominioTickets } from '@/lib/ticketsUrl';

/**
 * Pedidos de informática. Uma rota, dois layouts conforme quem olha:
 * - Com sessão: caixa de entrada com a conversa de cada pedido. Quem gere vê
 *   todos os que a RLS deixar; os outros só os seus.
 * - Sem sessão (quem chega só pelo link, sem conta): só o formulário, ao
 *   centro. Ao enviar, segue para a conversa do pedido pelo link dele.
 */
export default function TicketsTI() {
  const params = useParams<{ token: string }>();
  const navigate = useNavigate();
  // Sem token no caminho, esta página só é servida na raiz do domínio próprio
  // de pedidos — e aí a organização é a dona desse domínio. É o que permite
  // partilhar `tickets.wegest.pt` em vez de `.../ti/<token>`.
  const token = params.token ?? tokenDoDominioTickets(window.location.hostname) ?? undefined;
  const { canEdit } = usePermissions();
  const { user } = useAuth();

  if (user) {
    return (
      <TiCaixaPedidos gestao={canEdit(RECURSOS.TI_TICKETS_GERIR)} uid={user.id} token={token} />
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
          <LifeBuoy className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">Pedidos de informática</h1>
          <p className="text-xs text-muted-foreground">
            Descreva o problema. O suporte responde na conversa do pedido.
          </p>
        </div>
      </div>
      {token ? (
        <TiTicketFormulario
          token={token}
          onSubmetido={({ acessoToken }) => navigate(`/ti/ticket/${acessoToken}`)}
        />
      ) : (
        <p className="text-sm text-destructive">Link inválido.</p>
      )}
    </div>
  );
}
