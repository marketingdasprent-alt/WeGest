import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { MapPin, Loader2, Gauge, Clock, Power, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  useCartrackVehicles,
  useCartrackLive,
  hasValidPosition,
  plateKey,
  INTERVALO_LIVE_SEGUNDOS,
  type CartrackVehicle,
} from '@/hooks/useCartrackVehicles';

// Ícone default do Leaflet parte-se com bundlers (Vite) — reapontar para os
// assets importados (resolvidos como URLs pelo Vite).
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Ícone de carro personalizado (public/images/icon_cartrack.png).
const carIcon = L.icon({
  iconUrl: '/images/icon_cartrack.png',
  iconSize: [38, 38],
  iconAnchor: [19, 19], // centrado na coordenada
  popupAnchor: [0, -18],
});

// Centro por omissão: Portugal continental.
const PORTUGAL_CENTER: [number, number] = [39.5, -8.0];

/** Voa para a viatura selecionada na lista lateral. */
function MapController({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 15, { duration: 0.8 });
  }, [target, map]);
  return null;
}

function formatPositionTime(iso: string | null): string {
  if (!iso) return 'Sem data';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy HH:mm', { locale: pt });
  } catch {
    return iso;
  }
}

/** Normaliza matrícula/termo para pesquisa (minúsculas, sem separadores). */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function VehicleListItem({
  v,
  onClick,
  active,
}: {
  v: CartrackVehicle;
  onClick: () => void;
  active: boolean;
}) {
  const positionable = hasValidPosition(v);
  // O estado seleccionado era `bg-muted` — exactamente o mesmo do hover, pelo
  // que não havia forma de ver qual a viatura activa depois de tirar o rato de
  // cima. Passa a barra de cor + fundo da marca, que o hover nunca usa.
  return (
    <button
      type="button"
      onClick={positionable ? onClick : undefined}
      disabled={!positionable}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'w-full border-l-2 px-3 py-2 text-left transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        positionable ? 'cursor-pointer' : 'cursor-default opacity-50',
        active
          ? 'border-primary bg-primary/10'
          : cn('border-transparent', positionable && 'hover:bg-muted/60')
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'truncate font-mono text-xs font-semibold tabular-nums',
            active && 'text-primary'
          )}
        >
          {v.registration || v.descricao || v.cartrack_vehicle_id}
        </span>
        {v.ignition != null && (
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              v.ignition ? 'bg-success' : 'bg-muted-foreground/40'
            )}
            title={v.ignition ? 'Ignição ligada' : 'Ignição desligada'}
          />
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
        {v.odometer != null && <span>{Math.round(v.odometer).toLocaleString('pt-PT')} km</span>}
        {v.speed != null && v.speed > 0 && <span>· {Math.round(v.speed)} km/h</span>}
      </div>
    </button>
  );
}

export const CartrackMapCard: React.FC = () => {
  const { toast } = useToast();
  const { data: vehicles, isLoading, error, refetch } = useCartrackVehicles(true);
  const [target, setTarget] = useState<[number, number] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [live, setLive] = useState(false);

  // Progresso do sync. O overlay era um spinner mudo: quando a sincronização
  // demorava ~40 s, quem carregava no botão não tinha como distinguir "está a
  // trabalhar" de "está pendurado", desistia a meio e dava o botão como
  // avariado. O passo e os segundos decorridos custam duas linhas e tiram a
  // ambiguidade toda.
  const [syncPasso, setSyncPasso] = useState<string | null>(null);
  const [syncSegundos, setSyncSegundos] = useState(0);

  useEffect(() => {
    if (!syncing) {
      setSyncSegundos(0);
      return;
    }
    const t = window.setInterval(() => setSyncSegundos((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [syncing]);

  // Integração para o modo ao vivo (derivada das viaturas carregadas).
  const liveIntegracaoId = useMemo(
    () => (vehicles ?? []).map((v) => v.integracao_id).find(Boolean) ?? null,
    [vehicles]
  );
  const { data: livePositions } = useCartrackLive(liveIntegracaoId, {
    enabled: live,
  });

  // Funde as posições ao vivo sobre os dados da BD (por matrícula).
  const displayVehicles = useMemo(() => {
    const base = vehicles ?? [];
    if (!live || !livePositions?.length) return base;
    const m = new Map(
      livePositions.filter((p) => p.registration).map((p) => [plateKey(p.registration), p])
    );
    return base.map((v) => {
      const lp = v.registration ? m.get(plateKey(v.registration)) : undefined;
      if (!lp) return v;
      return {
        ...v,
        last_latitude: lp.latitude ?? v.last_latitude,
        last_longitude: lp.longitude ?? v.last_longitude,
        speed: lp.speed ?? v.speed,
        ignition: lp.ignition ?? v.ignition,
        odometer: lp.odometer ?? v.odometer,
        last_position_at: lp.event_ts ?? v.last_position_at,
      };
    });
  }, [vehicles, live, livePositions]);

  // Filtro de pesquisa por matrícula/descrição.
  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return displayVehicles;
    const qPlate = norm(q);
    const qLower = q.toLowerCase();
    return displayVehicles.filter((v) => {
      const reg = v.registration ? norm(v.registration) : '';
      const desc = v.descricao ? v.descricao.toLowerCase() : '';
      return (qPlate && reg.includes(qPlate)) || desc.includes(qLower);
    });
  }, [displayVehicles, search]);

  const positioned = useMemo(() => filtered.filter(hasValidPosition), [filtered]);
  const totalPositioned = useMemo(
    () => displayVehicles.filter(hasValidPosition).length,
    [displayVehicles]
  );

  const initialCenter = useMemo<[number, number]>(() => {
    const first = displayVehicles.find(hasValidPosition);
    if (first) return [first.last_latitude as number, first.last_longitude as number];
    return PORTUGAL_CENTER;
  }, [displayVehicles]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncPasso('a apurar integrações');
    try {
      // Integrações a sincronizar — derivadas das próprias viaturas já carregadas
      // (evita ler plataformas_configuracao no browser). Usa o cartrack-sync,
      // que está sempre deployado.
      const ids = [
        ...new Set((vehicles ?? []).map((v) => v.integracao_id).filter(Boolean) as string[]),
      ];
      if (ids.length === 0) {
        toast({
          title: 'Configure a integração primeiro',
          description: 'Crie a integração Cartrack em Integrações e sincronize uma vez.',
        });
        return;
      }

      // Sync rápido só de posições/odómetro (positions_only) — trips/events ficam
      // para o sync automático/Integrações. Mantém o botão do mapa ágil.
      let sincronizadas = 0;
      for (const [i, id] of ids.entries()) {
        setSyncPasso(
          ids.length > 1 ? `a sincronizar (${i + 1}/${ids.length})` : 'a sincronizar com a Cartrack'
        );
        const { data, error: fnErr } = await supabase.functions.invoke('cartrack-sync', {
          body: { integracao_id: id, positions_only: true },
        });
        if (fnErr || !data?.success) {
          throw new Error(data?.error || fnErr?.message || 'Falha ao sincronizar');
        }
        sincronizadas += data.vehicles?.upserted ?? 0;
        // A API da Cartrack pode recusar o pedido e ainda assim o sync
        // "correr": sem isto, uma frota inteira por atualizar aparecia como
        // sucesso silencioso.
        if (data.vehicles?.erro_api) {
          throw new Error(`A Cartrack recusou o pedido — ${data.vehicles.erro_api}`);
        }
      }
      setSyncPasso('a recarregar posições');
      await refetch();
      toast({
        title: 'Cartrack atualizado',
        description: `${sincronizadas} ${sincronizadas === 1 ? 'viatura sincronizada' : 'viaturas sincronizadas'}.`,
      });
    } catch (e: any) {
      toast({ title: 'Erro ao sincronizar', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
      setSyncPasso(null);
    }
  };

  // O contador de posições sobe para junto do título: é uma leitura sobre os
  // dados do cartão, não um controlo — estava perdido no fim da fila de botões.
  const header = (
    <div className="flex items-center justify-between gap-2 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <MapPin className="h-4 w-4 shrink-0 text-primary" />
        <h3 className="text-sm font-semibold">Car Track</h3>
        {vehicles && vehicles.length > 0 && (
          <span className="truncate text-xs tabular-nums text-muted-foreground">
            {totalPositioned}/{vehicles.length} localizadas
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-7 gap-1.5 px-2 text-xs font-medium',
            live &&
              'border-success/40 bg-success/10 text-success hover:bg-success/15 hover:text-success'
          )}
          onClick={() => setLive((s) => !s)}
          aria-pressed={live}
          title={
            live ? 'Desligar tempo real' : `Seguir em tempo real (${INTERVALO_LIVE_SEGUNDOS}s)`
          }
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              live ? 'animate-pulse bg-success' : 'bg-muted-foreground/50'
            )}
          />
          Ao vivo
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleSync}
          disabled={syncing}
          title="Sincronizar agora"
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );

  // Loading inicial
  if (isLoading) {
    return (
      <Card className="overflow-hidden rounded-xl shadow-none">
        {header}
        <div className="flex h-[300px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  // Erro
  if (error) {
    return (
      <Card className="overflow-hidden rounded-xl shadow-none">
        {header}
        <div className="flex h-[300px] flex-col items-center justify-center gap-2 p-4 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground/40" />
          <p className="max-w-[260px] text-xs text-muted-foreground">
            Não foi possível carregar as posições Cartrack.
          </p>
        </div>
      </Card>
    );
  }

  // Sem viaturas de todo
  if (!vehicles || vehicles.length === 0) {
    return (
      <Card className="overflow-hidden rounded-xl shadow-none">
        {header}
        <div className="flex h-[300px] flex-col items-center justify-center gap-2 p-4 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-semibold">Sem posições ainda</p>
          <p className="max-w-[280px] text-xs text-muted-foreground">
            Clica em <RefreshCw className="inline h-3 w-3" /> para sincronizar a localização das
            viaturas.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-xl shadow-none">
      {header}
      {/* O recorte tem de estar TAMBÉM aqui e não só no <Card>: os tiles do
          Leaflet são filhos com transform, e o border-radius do cartão sozinho
          não os corta — o mapa comia os cantos de baixo e a borda com eles. */}
      <div className="flex h-[288px] flex-col overflow-hidden rounded-b-xl border-t border-border/60 sm:flex-row">
        {/* Mapa — `isolate` cria um stacking context próprio para os z-index altos
            do Leaflet não passarem à frente dos toasts/modais da app. */}
        <div className="flex-1 relative min-h-[200px] isolate">
          <MapContainer
            center={initialCenter}
            zoom={totalPositioned > 1 ? 7 : 13}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController target={target} />
            {positioned.map((v) => (
              <Marker
                // Coordenadas na key: força o Leaflet a reposicionar o marcador
                // quando a posição muda (o react-leaflet nem sempre o faz só com o
                // prop `position`). Essencial para o modo "Ao vivo".
                key={`${v.id}:${v.last_latitude},${v.last_longitude}`}
                position={[v.last_latitude as number, v.last_longitude as number]}
                icon={carIcon}
              >
                <Popup>
                  <div className="space-y-1">
                    <p className="font-semibold text-sm">
                      {v.registration || v.descricao || v.cartrack_vehicle_id}
                    </p>
                    {v.odometer != null && (
                      <p className="flex items-center gap-1 text-xs">
                        <Gauge className="h-3 w-3" />
                        {Math.round(v.odometer).toLocaleString('pt-PT')} km
                      </p>
                    )}
                    <p className="flex items-center gap-1 text-xs">
                      <Clock className="h-3 w-3" />
                      {formatPositionTime(v.last_position_at)}
                    </p>
                    {v.ignition != null && (
                      <p className="flex items-center gap-1 text-xs">
                        <Power className="h-3 w-3" />
                        {v.ignition ? 'Ignição ligada' : 'Ignição desligada'}
                        {v.speed != null && v.speed > 0 ? ` · ${Math.round(v.speed)} km/h` : ''}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Overlay de carregamento durante o sync */}
          {syncing && (
            <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-xs font-medium text-muted-foreground">A sincronizar viaturas…</p>
              <p className="text-[11px] text-muted-foreground/80">
                {syncPasso ?? '…'} · {syncSegundos}s
              </p>
            </div>
          )}
        </div>

        {/* Lista lateral com pesquisa */}
        <div className="flex w-full shrink-0 flex-col border-t border-border sm:w-52 sm:border-l sm:border-t-0">
          {/* Campo sem caixa própria: dentro de uma coluna já delimitada, a
              borda do input era um segundo contorno a competir com o do
              cartão. O fundo `muted` chega para o marcar como editável. */}
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar matrícula…"
                aria-label="Pesquisar matrícula"
                className="h-8 border-0 bg-muted/60 pl-7 text-xs"
              />
            </div>
          </div>
          <div className="custom-scrollbar flex-1 divide-y divide-border/50 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-3 text-center text-xs text-muted-foreground">Sem resultados.</p>
            ) : (
              filtered.map((v) => (
                <VehicleListItem
                  key={v.id}
                  v={v}
                  active={activeId === v.id}
                  onClick={() => {
                    setActiveId(v.id);
                    setTarget([v.last_latitude as number, v.last_longitude as number]);
                  }}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
