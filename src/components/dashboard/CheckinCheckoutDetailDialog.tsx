import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  X,
  Car,
  User,
  Users,
  Calendar,
  MessageSquare,
  Camera,
  LogIn,
  LogOut,
  ImageOff,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Banknote,
  Gauge,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CheckinCheckoutSession, SessionMedia } from '@/hooks/useCheckinCheckoutHistorico';

const BUCKET = 'contrato-media';

// ── Imagem com URL assinada ───────────────────────────────────────────────────
function ContratoMediaImage({
  path,
  className,
  onClick,
}: {
  path: string;
  className?: string;
  onClick?: () => void;
}) {
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

  if (!src) return <Skeleton className={className} />;
  return <img src={src} className={className} alt="" onClick={onClick} />;
}

// ── Galeria de fotos ──────────────────────────────────────────────────────────
function PhotoGrid({
  media,
  onOpen,
  empty,
}: {
  media: SessionMedia[];
  onOpen: (index: number) => void;
  empty: string;
}) {
  if (media.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
        <ImageOff className="h-8 w-8 opacity-30" />
        <p className="text-sm italic">{empty}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
      {media.map((m, i) => (
        <div
          key={m.id}
          className="aspect-square rounded-lg overflow-hidden border bg-muted cursor-pointer hover:ring-2 hover:ring-primary transition-all"
          onClick={() => onOpen(i)}
        >
          <ContratoMediaImage path={m.url} className="w-full h-full object-cover" />
        </div>
      ))}
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
interface LightboxState {
  open: boolean;
  index: number;
  media: SessionMedia[];
  signedUrls: (string | null)[];
}

function Lightbox({ state, onClose }: { state: LightboxState; onClose: () => void }) {
  const [urls, setUrls] = useState<(string | null)[]>([]);

  useEffect(() => {
    if (!state.open) return;
    let cancelled = false;
    Promise.all(
      state.media.map((m) =>
        supabase.storage
          .from(BUCKET)
          .createSignedUrl(m.url, 60 * 30)
          .then(({ data }) => data?.signedUrl ?? null)
      )
    ).then((resolved) => {
      if (!cancelled) setUrls(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [state.open, state.media]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (state.open) setIdx(state.index);
  }, [state.open, state.index]);

  const total = state.media.length;
  const currentUrl = urls[idx] ?? null;
  const currentMedia = state.media[idx];

  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);
  const download = () => {
    if (!currentUrl) return;
    const a = document.createElement('a');
    a.href = currentUrl;
    a.download = `foto-${Date.now()}.jpg`;
    a.target = '_blank';
    a.click();
  };

  return (
    <Dialog
      open={state.open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 bg-black/95 border-none flex flex-col items-center justify-center overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Visualização de Foto</DialogTitle>
          <DialogDescription>Foto do check-in/check-out</DialogDescription>
        </DialogHeader>

        <div className="absolute top-4 right-4 z-50 flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 rounded-full"
            onClick={download}
          >
            <Download className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 rounded-full"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-12">
          {total > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 sm:left-6 z-40 text-white hover:bg-white/20 rounded-full h-12 w-12"
                onClick={prev}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 sm:right-6 z-40 text-white hover:bg-white/20 rounded-full h-12 w-12"
                onClick={next}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}
          <div className="max-w-full max-h-full flex flex-col items-center gap-4">
            {currentUrl ? (
              <img
                src={currentUrl}
                alt="Preview"
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <Skeleton className="w-64 h-64 rounded-lg" />
            )}
            <div className="text-white text-center bg-black/60 px-4 py-2 rounded-xl backdrop-blur-md border border-white/10">
              <p className="text-[11px] font-mono text-white/50">
                {idx + 1} / {total}
              </p>
              {currentMedia?.created_at && (
                <p className="text-[10px] text-white/30 mt-0.5">
                  {format(parseISO(currentMedia.created_at), 'dd MMM yyyy HH:mm', { locale: pt })}
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog principal ──────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: CheckinCheckoutSession | null;
}

export const CheckinCheckoutDetailDialog: React.FC<Props> = ({ open, onOpenChange, session }) => {
  const [lightbox, setLightbox] = useState<LightboxState>({
    open: false,
    index: 0,
    media: [],
    signedUrls: [],
  });

  const isLegacy = session?.sistema === 'legacy';
  const reservaId = session?.contrato?.reserva_id ?? null;

  const { data: condutores = [] } = useQuery({
    queryKey: ['checkin-detail-condutores', reservaId],
    enabled: open && !!reservaId && !isLegacy,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reserva_condutores')
        .select(
          'id, is_principal, clientes:cliente_id (id, nome, nif), motoristas:motorista_id (id, nome)'
        )
        .eq('reserva_id', reservaId as string)
        .order('is_principal', { ascending: false });
      if (error) return [];
      return (data ?? [])
        .map((c: any) => ({
          id: c.id,
          isPrincipal: c.is_principal as boolean,
          nome: c.clientes?.nome ?? c.motoristas?.nome ?? null,
          nif: c.clientes?.nif ?? null,
        }))
        .filter((c: any) => c.nome);
    },
  });

  if (!session) return null;

  const { contrato, mediaCheckin, mediaCheckout } = session;
  const codigo = contrato?.codigo ? `RNT-${String(contrato.codigo).padStart(4, '0')}` : '—';
  const hasCheckin = mediaCheckin.length > 0;
  const hasCheckout = mediaCheckout.length > 0;

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      return format(parseISO(iso), 'dd MMM yyyy HH:mm', { locale: pt });
    } catch {
      return iso;
    }
  };

  const openLightbox = (media: SessionMedia[], index: number) =>
    setLightbox({ open: true, index, media, signedUrls: [] });

  const defaultTab = hasCheckin ? 'checkin' : 'checkout';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              {contrato?.viatura?.matricula ?? '—'}
              {contrato?.codigo && (
                <span className="text-muted-foreground font-normal text-sm">· {codigo}</span>
              )}
            </DialogTitle>
            <DialogDescription>
              {contrato?.cliente?.nome ?? contrato?.motorista_nome ?? 'Condutor desconhecido'}
              {contrato?.viatura && ` · ${contrato.viatura.marca} ${contrato.viatura.modelo}`}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 mt-2">
            <div className="space-y-4 p-1 pr-3">
              {/* Info do contrato */}
              <section className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Car className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Viatura</p>
                      <p className="font-medium">
                        {contrato?.viatura
                          ? `${contrato.viatura.matricula} · ${contrato.viatura.marca} ${contrato.viatura.modelo}`
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {isLegacy ? 'Motorista' : 'Cliente'}
                      </p>
                      <p className="font-medium">
                        {contrato?.cliente?.nome ?? contrato?.motorista_nome ?? '—'}
                      </p>
                      {(contrato?.cliente?.nif ?? contrato?.motorista_nif) && (
                        <p className="text-xs text-muted-foreground">
                          NIF: {contrato?.cliente?.nif ?? contrato?.motorista_nif}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Período</p>
                      <p className="font-medium">
                        {formatDate(contrato?.data_inicio)} →{' '}
                        {contrato?.data_fim ? formatDate(contrato.data_fim) : 'Em curso'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {hasCheckin && (
                    <Badge
                      variant="outline"
                      className="border-blue-400 text-blue-600 dark:text-blue-400 text-[10px]"
                    >
                      <LogIn className="h-3 w-3 mr-1" /> Check-in ({mediaCheckin.length} fotos)
                    </Badge>
                  )}
                  {hasCheckout && (
                    <Badge
                      variant="outline"
                      className="border-green-400 text-green-600 dark:text-green-400 text-[10px]"
                    >
                      <LogOut className="h-3 w-3 mr-1" /> Check-out ({mediaCheckout.length} fotos)
                    </Badge>
                  )}
                </div>
              </section>

              {/* Ficha do motorista (legado) */}
              {isLegacy && (
                <section className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" /> Ficha do Motorista
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {contrato?.motorista_nome && (
                      <div className="flex items-start gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Nome</p>
                          <p className="font-medium">{contrato.motorista_nome}</p>
                          {contrato.motorista_nif && (
                            <p className="text-xs text-muted-foreground">
                              NIF: {contrato.motorista_nif}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {contrato?.motorista_email && (
                      <div className="flex items-start gap-2">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Email</p>
                          <p className="font-medium break-all">{contrato.motorista_email}</p>
                        </div>
                      </div>
                    )}
                    {contrato?.motorista_telefone && (
                      <div className="flex items-start gap-2">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Telemóvel</p>
                          <p className="font-medium">{contrato.motorista_telefone}</p>
                        </div>
                      </div>
                    )}
                    {(contrato?.motorista_cidade || contrato?.motorista_morada) && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Localidade</p>
                          <p className="font-medium">
                            {contrato?.motorista_cidade ?? contrato?.motorista_morada}
                          </p>
                        </div>
                      </div>
                    )}
                    {contrato?.motorista_iban && (
                      <div className="flex items-start gap-2 sm:col-span-2">
                        <CreditCard className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">IBAN</p>
                          <p className="font-medium font-mono text-xs tracking-wide">
                            {contrato.motorista_iban}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dados financeiros */}
                  {(contrato?.viatura?.valor_mensal != null ||
                    contrato?.motorista_caucao != null ||
                    contrato?.viatura?.limite_kms != null ||
                    contrato?.motorista_cartao_frota) && (
                    <div className="pt-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      {contrato?.viatura?.valor_mensal != null && (
                        <div className="flex items-start gap-2">
                          <Banknote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">Valor</p>
                            <p className="font-semibold">
                              {contrato.viatura.valor_mensal.toLocaleString('pt-PT', {
                                style: 'currency',
                                currency: 'EUR',
                              })}
                            </p>
                          </div>
                        </div>
                      )}
                      {contrato?.motorista_caucao != null && (
                        <div className="flex items-start gap-2">
                          <Banknote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">Caução</p>
                            <p className="font-semibold">
                              {contrato.motorista_caucao.toLocaleString('pt-PT', {
                                style: 'currency',
                                currency: 'EUR',
                              })}
                            </p>
                          </div>
                        </div>
                      )}
                      {contrato?.viatura?.limite_kms != null && (
                        <div className="flex items-start gap-2">
                          <Gauge className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">Kms</p>
                            <p className="font-semibold">
                              {contrato.viatura.limite_kms.toLocaleString('pt-PT')}
                            </p>
                          </div>
                        </div>
                      )}
                      {contrato?.motorista_cartao_frota && (
                        <div className="flex items-start gap-2">
                          <CreditCard className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">Cartão Frota</p>
                            <p className="font-semibold">{contrato.motorista_cartao_frota}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* KMs e combustível do check-in/out */}
                  {(contrato?.km_checkin != null ||
                    contrato?.km_checkout != null ||
                    contrato?.combustivel_checkin ||
                    contrato?.combustivel_checkout) && (
                    <div className="pt-3 border-t grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      {contrato?.km_checkin != null && (
                        <div>
                          <span className="font-medium text-foreground">KM Check-in:</span>{' '}
                          {contrato.km_checkin.toLocaleString('pt-PT')}
                        </div>
                      )}
                      {contrato?.km_checkout != null && (
                        <div>
                          <span className="font-medium text-foreground">KM Check-out:</span>{' '}
                          {contrato.km_checkout.toLocaleString('pt-PT')}
                        </div>
                      )}
                      {contrato?.combustivel_checkin && (
                        <div>
                          <span className="font-medium text-foreground">Comb. entrada:</span>{' '}
                          {contrato.combustivel_checkin}
                        </div>
                      )}
                      {contrato?.combustivel_checkout && (
                        <div>
                          <span className="font-medium text-foreground">Comb. saída:</span>{' '}
                          {contrato.combustivel_checkout}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Condutores renting */}
              {!isLegacy && condutores.length > 0 && (
                <section className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" /> Condutor{condutores.length !== 1 ? 'es' : ''}
                  </h3>
                  <div className="space-y-2">
                    {condutores.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-sm">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium">{c.nome}</span>
                        {c.isPrincipal && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            Principal
                          </span>
                        )}
                        {c.nif && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            NIF: {c.nif}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Observações */}
              {(contrato?.comentarios_entrega || contrato?.comentarios_recolha) && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5" /> Observações
                  </h3>
                  {contrato.comentarios_entrega && (
                    <div className="rounded-md border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Entrega</p>
                      <p className="text-sm">{contrato.comentarios_entrega}</p>
                    </div>
                  )}
                  {contrato.comentarios_recolha && (
                    <div className="rounded-md border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Recolha</p>
                      <p className="text-sm">{contrato.comentarios_recolha}</p>
                    </div>
                  )}
                </section>
              )}

              {/* Fotos com tabs */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Camera className="h-3.5 w-3.5" /> Fotos (
                  {mediaCheckin.length + mediaCheckout.length})
                </h3>
                {hasCheckin && hasCheckout ? (
                  <Tabs defaultValue={defaultTab}>
                    <TabsList className="h-8">
                      <TabsTrigger value="checkin" className="text-xs gap-1.5">
                        <LogIn className="h-3 w-3" /> Check-in ({mediaCheckin.length})
                      </TabsTrigger>
                      <TabsTrigger value="checkout" className="text-xs gap-1.5">
                        <LogOut className="h-3 w-3" /> Check-out ({mediaCheckout.length})
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="checkin" className="mt-3">
                      <PhotoGrid
                        media={mediaCheckin}
                        onOpen={(i) => openLightbox(mediaCheckin, i)}
                        empty="Sem fotos de check-in."
                      />
                    </TabsContent>
                    <TabsContent value="checkout" className="mt-3">
                      <PhotoGrid
                        media={mediaCheckout}
                        onOpen={(i) => openLightbox(mediaCheckout, i)}
                        empty="Sem fotos de check-out."
                      />
                    </TabsContent>
                  </Tabs>
                ) : (
                  <PhotoGrid
                    media={hasCheckin ? mediaCheckin : mediaCheckout}
                    onOpen={(i) => openLightbox(hasCheckin ? mediaCheckin : mediaCheckout, i)}
                    empty="Sem fotos registadas."
                  />
                )}
              </section>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Lightbox state={lightbox} onClose={() => setLightbox((s) => ({ ...s, open: false }))} />
    </>
  );
};
