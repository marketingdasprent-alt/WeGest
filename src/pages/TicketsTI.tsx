import { useParams } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { MeusTiTicketsLista } from '@/components/ti/MeusTiTicketsLista';
import { TiTicketFormulario } from '@/components/ti/TiTicketFormulario';
import { TiTicketLista } from '@/components/ti/TiTicketLista';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { tokenDoDominioTickets } from '@/lib/ticketsUrl';

/**
 * Pedidos de informática. Uma rota, três layouts conforme quem olha:
 * - Quem gere tickets: duas colunas — caixa de novo pedido + lista com
 *   filtro e pesquisa (todas as empresas que a RLS deixar ver).
 * - Com sessão mas sem gerir: uma coluna, caixa + o próprio histórico
 *   (leitura, ver MeusTiTicketsLista).
 * - Sem sessão (quem chega só pelo link, sem conta): só a caixa, ao centro,
 *   como sempre foi — não fica a saber que existe lista nenhuma.
 */
export default function TicketsTI() {
  const params = useParams<{ token: string }>();
  // Sem token no caminho, esta página só é servida na raiz do domínio próprio
  // de pedidos — e aí a organização é a dona desse domínio. É o que permite
  // partilhar `tickets.wegest.pt` em vez de `.../ti/<token>`.
  const token = params.token ?? tokenDoDominioTickets(window.location.hostname) ?? undefined;
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.TI_TICKETS_GERIR);
  const { user } = useAuth();

  const cabecalho = (
    <div className="flex items-center gap-2">
      <LifeBuoy className="h-5 w-5 text-primary" />
      <h1 className="text-lg font-semibold">Pedidos de informática</h1>
    </div>
  );

  const caixa = token ? (
    <TiTicketFormulario token={token} />
  ) : (
    <p className="text-sm text-destructive">Link inválido.</p>
  );

  if (podeGerir) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        {cabecalho}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>{caixa}</div>
          <TiTicketLista />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {cabecalho}
      {caixa}
      {user && <MeusTiTicketsLista />}
    </div>
  );
}
