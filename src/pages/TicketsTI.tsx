import { useParams } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { TiTicketFormulario } from '@/components/ti/TiTicketFormulario';
import { TiTicketLista } from '@/components/ti/TiTicketLista';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { tokenDoDominioTickets } from '@/lib/ticketsUrl';

/**
 * Pedidos de informática. Uma rota, comportamento conforme quem olha: quem
 * chega sem sessão — ou com sessão mas sem `ti_tickets_gerir` — vê só o
 * formulário e não fica a saber que existe uma lista. Quem tem a permissão vê
 * as duas coisas.
 */
export default function TicketsTI() {
  const params = useParams<{ token: string }>();
  // Sem token no caminho, esta página só é servida na raiz do domínio próprio
  // de pedidos — e aí a organização é a dona desse domínio. É o que permite
  // partilhar `tickets.wegest.pt` em vez de `.../ti/<token>`.
  const token = params.token ?? tokenDoDominioTickets(window.location.hostname) ?? undefined;
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.TI_TICKETS_GERIR);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Pedidos de informática</h1>
      </div>

      {token ? (
        <TiTicketFormulario token={token} />
      ) : (
        <p className="text-sm text-destructive">Link inválido.</p>
      )}

      {podeGerir && <TiTicketLista />}
    </div>
  );
}
