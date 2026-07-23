import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Camera, LogIn, LogOut, ImageOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useCheckinCheckoutHistorico,
  useMediaSignedUrl,
  type CheckinCheckoutSession,
  type SessionMedia,
} from '@/hooks/useCheckinCheckoutHistorico';
import { CheckinCheckoutDetailDialog } from './CheckinCheckoutDetailDialog';

const PREVIEW_SIZE = 5;

function ThumbnailImage({ media }: { media: SessionMedia }) {
  const src = useMediaSignedUrl(media);
  if (!src) return <Skeleton className="w-full h-full rounded-md" />;
  return <img src={src} className="w-full h-full object-cover" alt="" />;
}

function SessionRow({
  session,
  onClick,
}: {
  session: CheckinCheckoutSession;
  onClick: () => void;
}) {
  const viatura = session.contrato?.viatura;
  const nomeCondutor = session.contrato?.cliente?.nome ?? session.contrato?.motorista_nome;
  // Badge vem do evento realizado (fonte de verdade do momento).
  const hasCheckin = !!session.checkinAt;
  const hasCheckout = !!session.checkoutAt;
  const totalFotos = session.fotos.length;

  const dataFormatada = (() => {
    try {
      return format(parseISO(session.created_at), 'dd MMM yyyy HH:mm', { locale: pt });
    } catch {
      return session.created_at;
    }
  })();

  return (
    <div
      className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted transition-colors cursor-pointer"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 border bg-muted">
        {session.thumbnail ? (
          <ThumbnailImage media={session.thumbnail} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5 flex-wrap">
          {hasCheckin && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
            >
              <LogIn className="h-2.5 w-2.5 mr-0.5" /> Check-in
            </Badge>
          )}
          {hasCheckout && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
            >
              <LogOut className="h-2.5 w-2.5 mr-0.5" /> Check-out
            </Badge>
          )}
          {viatura && (
            <span className="font-mono text-xs text-muted-foreground truncate">
              {viatura.matricula}
            </span>
          )}
        </div>
        <p className="text-sm font-medium truncate leading-tight">
          {nomeCondutor ?? (
            <span className="text-muted-foreground italic">Condutor desconhecido</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{dataFormatada}</p>
      </div>

      {/* Contagem de fotos */}
      <Badge variant="outline" className="shrink-0 text-[10px]">
        {totalFotos} foto{totalFotos !== 1 ? 's' : ''}
      </Badge>
    </div>
  );
}

interface Props {
  enabled: boolean;
}

export const CheckinCheckoutHistoricoCard: React.FC<Props> = ({ enabled }) => {
  const { data: sessions = [], isLoading } = useCheckinCheckoutHistorico(enabled);
  const [listOpen, setListOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CheckinCheckoutSession | null>(null);

  const previewSessions = sessions.slice(0, PREVIEW_SIZE);
  const hasMore = sessions.length > PREVIEW_SIZE;

  const openDetail = (s: CheckinCheckoutSession) => {
    setListOpen(false);
    setSelectedSession(s);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-5 w-5 text-primary" />
            Histórico Check-in / Check-out
            {!isLoading && sessions.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs font-normal">
                {sessions.length} {sessions.length !== 1 ? 'sessões' : 'sessão'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5">
                  <Skeleton className="w-12 h-12 rounded-md shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <Camera className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Ainda não há check-ins ou check-outs com fotografias.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {previewSessions.map((s) => (
                  <SessionRow key={s.key} session={s} onClick={() => openDetail(s)} />
                ))}
              </div>

              {hasMore && (
                <div className="pt-3 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => setListOpen(true)}
                  >
                    Mostrar todos ({sessions.length})
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal com a lista completa */}
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              Histórico Check-in / Check-out
              <Badge variant="secondary" className="ml-1 text-xs font-normal">
                {sessions.length}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Todos os check-ins e check-outs com fotografias. Clica para ver o detalhe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 overflow-y-auto max-h-[65vh] pr-1 -mr-1">
            {sessions.map((s) => (
              <SessionRow key={s.key} session={s} onClick={() => openDetail(s)} />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <CheckinCheckoutDetailDialog
        open={selectedSession !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedSession(null);
        }}
        session={selectedSession}
      />
    </>
  );
};
