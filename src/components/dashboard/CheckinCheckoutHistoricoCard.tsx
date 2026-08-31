import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Camera, LogIn, LogOut, ImageOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
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

// 4 e não 3: com a linha achatada (sem caixa por registo) cabem quatro
// sessões na mesma altura que as três antigas ocupavam.
const PREVIEW_SIZE = 4;

function ThumbnailImage({ media }: { media: SessionMedia }) {
  const src = useMediaSignedUrl(media);
  if (!src) return <Skeleton className="h-full w-full rounded-md" />;
  return <img src={src} className="h-full w-full object-cover" alt="" />;
}

/** Etiqueta do tipo de operação. Cores por token (marca/sucesso) em vez de
 *  blue-50/green-50 fixos, que no tema escuro precisavam de um segundo par de
 *  classes para cada estado. */
function TipoBadge({ tipo }: { tipo: 'checkin' | 'checkout' }) {
  const entrada = tipo === 'checkin';
  const Icon = entrada ? LogIn : LogOut;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
        entrada ? 'bg-brand-navy/10 text-brand-navy' : 'bg-success/10 text-success'
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {entrada ? 'Check-in' : 'Check-out'}
    </span>
  );
}

function SessionRow({
  session,
  onClick,
}: {
  session: CheckinCheckoutSession;
  onClick: () => void;
}) {
  const viatura = session.contrato?.viatura;
  // `motorista_nome` é o CONDUTOR (motorista TVDE ou condutor principal da
  // reserva) — `cliente` é a entidade contratante (pode ser uma empresa) e só
  // entra como fallback quando não há condutor identificado.
  const nomeCondutor = session.contrato?.motorista_nome ?? session.contrato?.cliente?.nome;
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

  // Ordem de leitura: o que aconteceu (tipo) + a quem (condutor) na primeira
  // linha; o que identifica a operação (matrícula, momento) na segunda; os
  // metadados (fotos) à direita, fora do caminho. Era um <div onClick> — passa
  // a <button> para ter teclado e foco, como as restantes linhas da homepage.
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
        {session.thumbnail ? (
          <ThumbnailImage media={session.thumbnail} />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-4 w-4 text-muted-foreground/40" />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {hasCheckin && <TipoBadge tipo="checkin" />}
          {hasCheckout && <TipoBadge tipo="checkout" />}
          <span className="truncate text-[13px] font-medium leading-tight">
            {nomeCondutor ?? (
              <span className="italic text-muted-foreground">Condutor desconhecido</span>
            )}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {viatura && <span className="font-mono tabular-nums">{viatura.matricula}</span>}
          {viatura && <span aria-hidden="true">·</span>}
          <span className="truncate">{dataFormatada}</span>
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
        <Camera className="h-3 w-3" />
        {totalFotos}
      </span>
    </button>
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
      <Card className="rounded-xl shadow-none">
        <CardHeader className="px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="h-4 w-4 text-primary" />
            Histórico Check-in / Check-out
            {!isLoading && sessions.length > 0 && (
              <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                {sessions.length} {sessions.length !== 1 ? 'sessões' : 'sessão'}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border/60">
              {Array.from({ length: PREVIEW_SIZE }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <Skeleton className="h-11 w-11 shrink-0 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <Camera className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Ainda não há check-ins ou check-outs com fotografias.
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/60">
                {previewSessions.map((s) => (
                  <SessionRow key={s.key} session={s} onClick={() => openDetail(s)} />
                ))}
              </div>

              {hasMore && (
                <div className="border-t border-border/60 px-4 py-1.5 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
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
          <div className="custom-scrollbar -mx-4 max-h-[65vh] divide-y divide-border/60 overflow-y-auto">
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
