import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, CheckCircle2, Clock, Loader2, Monitor, Smartphone } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import { useGerarTokenRealizacao, usePollEventoRealizado } from '@/hooks/useRealizacaoToken';
import { useIsMobile } from '@/hooks/use-mobile';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Evento de entrega/recolha a realizar — null fecha o dialog. */
  eventoId: string | null;
  tipo: 'entrega' | 'recolha';
  /** Resumo para mostrar no header (matrícula, contrato#). */
  resumo?: string;
  /** Após confirmação no telemóvel, chamado para limpar estado. */
  onDone?: () => void;
}

/**
 * Dialog mandatório: ao abrir um contrato com entrega/recolha por
 * realizar, o user tem de escolher entre:
 *   • Realizar agora — gera QR para o telemóvel (fotos + KM no terreno)
 *   • Deixar pendente — outro colaborador apanha via Check Out drawer
 */
export const RealizarEntregaDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  eventoId,
  tipo,
  resumo,
  onDone,
}) => {
  const [tokenId, setTokenId] = useState<string | null>(null);
  const navigate = useNavigate();
  const gerarToken = useGerarTokenRealizacao();
  const realizado = usePollEventoRealizado(eventoId, !!tokenId);
  const isMobile = useIsMobile();
  const autoAbriuRef = useRef(false);

  // Fazer o check no próprio computador: gera o token e abre a página de
  // realização neste browser (não precisa de telemóvel).
  const handleRealizarAqui = () => {
    if (!eventoId) return;
    gerarToken.mutate(eventoId, {
      onSuccess: (id) => navigate(`/realizar/${id}`),
    });
  };

  // No telemóvel não há escolha a fazer: "Fazer neste computador" está errado
  // (já estamos no telemóvel) e o QR existe justamente para saltar do
  // computador PARA o telemóvel. Quem abre o contrato no telemóvel e carrega
  // em "Realizar entrega" — o transferista no terreno — vai direto à folha.
  useEffect(() => {
    if (!open) {
      autoAbriuRef.current = false;
      return;
    }
    if (!isMobile || !eventoId || autoAbriuRef.current) return;
    autoAbriuRef.current = true;
    gerarToken.mutate(eventoId, { onSuccess: (id) => navigate(`/realizar/${id}`) });
  }, [open, isMobile, eventoId, gerarToken, navigate]);

  useEffect(() => {
    if (!open) setTokenId(null);
  }, [open]);

  const url = useMemo(
    () => (tokenId ? `${window.location.origin}/realizar/${tokenId}` : null),
    [tokenId]
  );

  const handleRealizarAgora = () => {
    if (!eventoId) return;
    gerarToken.mutate(eventoId, {
      onSuccess: (id) => setTokenId(id),
    });
  };

  // Telemóvel confirmou: fecha automaticamente após 1.2s
  useEffect(() => {
    if (realizado && tokenId) {
      const t = setTimeout(() => {
        onOpenChange(false);
        onDone?.();
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [realizado, tokenId, onOpenChange, onDone]);

  // Determina o que mostrar
  // No telemóvel as opções nunca chegam a aparecer — o efeito acima já
  // navegou para a folha; mostra-se só o estado de transição.
  const showInitial = !tokenId && !realizado && !isMobile;
  const showAutoMobile = !tokenId && !realizado && isMobile;
  const showQR = !!tokenId && !realizado;
  const showRealizado = !!realizado;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md max-h-[88vh] overflow-y-auto"
        // Bloqueia dismiss casual — utilizador tem que escolher um dos caminhos.
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            {tipo === 'entrega' ? 'Entrega' : 'Recolha'} pendente
          </DialogTitle>
          {resumo && <DialogDescription>{resumo}</DialogDescription>}
        </DialogHeader>

        {showRealizado && (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-12 w-12" />
            <p className="font-semibold">{tipo === 'entrega' ? 'Entrega' : 'Recolha'} confirmada</p>
            <p className="text-xs text-muted-foreground">A fechar...</p>
          </div>
        )}

        {showQR && url && (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="bg-white p-4 rounded-lg border">
              <QRCodeSVG value={url} size={200} level="M" />
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Expira em 30 minutos
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> À espera da confirmação...
            </div>
          </div>
        )}

        {showAutoMobile && (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">
              A abrir a folha de {tipo === 'entrega' ? 'entrega' : 'recolha'}…
            </p>
          </div>
        )}

        {showInitial && (
          <div className="space-y-2 py-1">
            <button
              type="button"
              onClick={handleRealizarAqui}
              disabled={gerarToken.isPending || !eventoId}
              className="w-full flex items-start gap-3 rounded-lg border-2 border-primary/40 bg-primary/5 p-3 text-left transition-colors hover:border-primary hover:bg-primary/10 disabled:opacity-50"
            >
              <Monitor className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">Fazer neste computador</div>
                <div className="text-xs text-muted-foreground">
                  Abre a página de check aqui — fotos, km e confirmação.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={handleRealizarAgora}
              disabled={gerarToken.isPending || !eventoId}
              className="w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/60 hover:bg-muted disabled:opacity-50"
            >
              <Smartphone className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">Telemóvel (QR)</div>
                <div className="text-xs text-muted-foreground">
                  Gera um QR code para fazer o check no telemóvel.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/60 hover:bg-muted"
            >
              <Clock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">Deixar pendente</div>
                <div className="text-xs text-muted-foreground">
                  Outro colaborador realiza mais tarde (Check In/Out no calendário).
                </div>
              </div>
            </button>

            {gerarToken.isPending && (
              <div className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> A preparar...
              </div>
            )}
          </div>
        )}

        {(showRealizado || showQR) && (
          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
            {showRealizado ? (
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto"
              >
                Fechar
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setTokenId(null)}
                className="gap-2 w-full sm:w-auto"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
