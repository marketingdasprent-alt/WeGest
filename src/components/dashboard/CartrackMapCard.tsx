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
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  useCartrackVehicles,
  useCartrackLive,
  hasValidPosition,
  plateKey,
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
  return (
    <button
      type="button"
      onClick={positionable ? onClick : undefined}
      disabled={!positionable}
      className={`w-full text-left px-3 py-2 border-b border-border/60 transition-colors ${
        positionable ? 'hover:bg-muted cursor-pointer' : 'opacity-50 cursor-default'
      } ${active ? 'bg-muted' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold truncate">
          {v.registration || v.descricao || v.cartrack_vehicle_id}
        </span>
        {v.ignition != null && (
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              v.ignition ? 'bg-emerald-500' : 'bg-muted-foreground/40'
            }`}
            title={v.ignition ? 'Ignição ligada' : 'Ignição desligada'}
          />
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
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

  // Integração para o modo ao vivo (derivada das viaturas carregadas).
  const liveIntegracaoId = useMemo(
    () => (vehicles ?? []).map((v) => v.integracao_id).find(Boolean) ?? null,
    [vehicles]
  );
  const { data: livePositions } = useCartrackLive(liveIntegracaoId, {
    enabled: live,
    intervalMs: 10_000,
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
      for (const id of ids) {
        const { data, error: fnErr } = await supabase.functions.invoke('cartrack-sync', {
          body: { integracao_id: id, positions_only: true },
        });
        if (fnErr || !data?.success) {
          throw new Error(data?.error || fnErr?.message || 'Falha ao sincronizar');
        }
      }
      await refetch();
      toast({ title: 'Cartrack atualizado', description: 'Posições sincronizadas.' });
    } catch (e: any) {
      toast({ title: 'Erro ao sincronizar', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const header = (
    <div className="flex items-center justify-between p-4 pb-2 gap-2">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Car Track</h3>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant={live ? 'default' : 'outline'}
          size="sm"
          className="h-7 gap-1.5 px-2"
          onClick={() => setLive((s) => !s)}
          title={live ? 'Desligar tempo real' : 'Seguir em tempo real (10s)'}
        >
          <span
            className={`h-2 w-2 rounded-full ${live ? 'bg-white animate-pulse' : 'bg-emerald-500'}`}
          />
          <span className="text-xs">Ao vivo</span>
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
        {vehicles && vehicles.length > 0 && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {totalPositioned}/{vehicles.length} localizadas
          </span>
        )}
      </div>
    </div>
  );

  // Loading inicial
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {header}
        <div className="flex items-center justify-center h-[300px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Erro
  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {header}
        <div className="flex flex-col items-center justify-center gap-2 text-center h-[300px] p-4">
          <MapPin className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground max-w-[260px]">
            Não foi possível carregar as posições Cartrack.
          </p>
        </div>
      </div>
    );
  }

  // Sem viaturas de todo
  if (!vehicles || vehicles.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {header}
        <div className="flex flex-col items-center justify-center gap-2 text-center h-[300px] p-4">
          <MapPin className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-semibold">Sem posições ainda</p>
          <p className="text-xs text-muted-foreground max-w-[280px]">
            Clica em <RefreshCw className="inline h-3 w-3" /> para sincronizar a localização das
            viaturas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {header}
      <div className="flex flex-col sm:flex-row h-[320px]">
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
            </div>
          )}
        </div>

        {/* Lista lateral com pesquisa */}
        <div className="w-full sm:w-52 shrink-0 border-t sm:border-t-0 sm:border-l border-border flex flex-col">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar matrícula…"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground text-center">Sem resultados.</p>
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
    </div>
  );
};
