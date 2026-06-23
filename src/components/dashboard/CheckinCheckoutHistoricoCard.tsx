import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Camera, LogIn, LogOut, Loader2, ImageOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import {
  useCheckinCheckoutHistorico,
  type CheckinCheckoutSession,
} from '@/hooks/useCheckinCheckoutHistorico';
import { CheckinCheckoutDetailDialog } from './CheckinCheckoutDetailDialog';

const BUCKET = 'contrato-media';
const PAGE_SIZE = 10;

function ThumbnailImage({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 10)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setSrc(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

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
  const hasCheckin = session.mediaCheckin.length > 0;
  const hasCheckout = session.mediaCheckout.length > 0;
  const totalFotos = session.mediaCheckin.length + session.mediaCheckout.length;

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
        {session.thumbnailPath ? (
          <ThumbnailImage path={session.thumbnailPath} />
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
  const [showAll, setShowAll] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CheckinCheckoutSession | null>(null);

  const visibleSessions = showAll ? sessions : sessions.slice(0, PAGE_SIZE);
  const hasMore = sessions.length > PAGE_SIZE;

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
              <div className="flex items-center justify-center py-2 text-xs text-muted-foreground gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />A carregar...
              </div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <Camera className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Ainda não há registos de check-in ou check-out.
              </p>
            </div>
          ) : (
            <>
              <ScrollArea className={showAll ? 'max-h-[520px]' : undefined}>
                <div className="space-y-2 pr-1">
                  {visibleSessions.map((s) => (
                    <SessionRow key={s.key} session={s} onClick={() => setSelectedSession(s)} />
                  ))}
                </div>
              </ScrollArea>

              {hasMore && !showAll && (
                <div className="pt-3 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => setShowAll(true)}
                  >
                    Ver todos ({sessions.length})
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

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
