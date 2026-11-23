import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { usePedidosPendentesCount } from '@/hooks/usePedidosTrocaKms';
import { avisoJaMostrado, marcarAvisoMostrado } from '@/utils/avisoPedidosPendentes';
import { ROTA_PEDIDOS_ALTERACAO, TIPO_BADGE_LABEL } from './rotulosPedido';

export const AvisoPedidosPendentes = () => {
  const { user } = useAuth();
  const { isAdmin, cargos, loading } = usePermissions();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);

  // Mesma regra do menu "Pedidos de alterações" (requireSupervisorTvde).
  const aprovador = !loading && (isAdmin || cargos.includes('Supervisor Gestor TVDE'));
  const userId = user?.id;
  const { data } = usePedidosPendentesCount(aprovador && !!userId);
  const total = data?.total ?? 0;

  useEffect(() => {
    // Na página dos pedidos não se gasta o aviso: pode aparecer ao sair dela.
    if (!userId || total === 0 || pathname === ROTA_PEDIDOS_ALTERACAO) return;
    if (avisoJaMostrado(userId)) return;
    marcarAvisoMostrado(userId);
    setAberto(true);
  }, [userId, total, pathname]);

  const ver = () => {
    setAberto(false);
    navigate(ROTA_PEDIDOS_ALTERACAO);
  };

  const detalhe = Object.entries(data?.porTipo ?? {})
    .map(([tipo, n]) => `${n} ${TIPO_BADGE_LABEL[tipo as keyof typeof TIPO_BADGE_LABEL]}`)
    .join(' · ');

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {total === 1 ? '1 pedido por responder' : `${total} pedidos por responder`}
          </DialogTitle>
          <DialogDescription>{detalhe}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setAberto(false)}>
            Fechar
          </Button>
          <Button onClick={ver}>Ver pedidos</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
