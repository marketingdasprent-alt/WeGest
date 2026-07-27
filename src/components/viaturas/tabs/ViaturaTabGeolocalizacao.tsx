import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Gauge, Fuel, Power, Clock, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  useCartrackVehicleByViatura,
  useCartrackLive,
  hasValidPosition,
  plateKey,
} from '@/hooks/useCartrackVehicles';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const carIcon = L.icon({
  iconUrl: '/images/icon_cartrack.png',
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -18],
});

/** Recentra o mapa quando a posição muda (segue a viatura no modo ao vivo). */
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy HH:mm', { locale: pt });
  } catch {
    return iso;
  }
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

interface Props {
  viaturaId?: string;
  matricula?: string;
}

export function ViaturaTabGeolocalizacao({ viaturaId, matricula }: Props) {
  const { toast } = useToast();
  const { data: v, isLoading, error, refetch } = useCartrackVehicleByViatura(viaturaId);
  const [syncing, setSyncing] = useState(false);
  const [live, setLive] = useState(false);

  const { data: livePositions } = useCartrackLive(v?.integracao_id, {
    registration: v?.registration,
    enabled: live && !!v,
    intervalMs: 10_000,
  });

  const handleSync = async () => {
    if (!v?.integracao_id) return;
    setSyncing(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('cartrack-sync', {
        body: { integracao_id: v.integracao_id, positions_only: true },
      });
      if (fnErr || !data?.success) {
        throw new Error(data?.error || fnErr?.message || 'Falha ao sincronizar');
      }
      await refetch();
      toast({ title: 'Atualizado', description: 'Localização sincronizada.' });
    } catch (e: any) {
      toast({ title: 'Erro ao sincronizar', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Sem correspondência no Cartrack (matrícula não ligada ou integração inexistente).
  if (error || !v) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 text-center py-16">
          <MapPin className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-semibold">Sem dados Cartrack</p>
          <p className="text-xs text-muted-foreground max-w-[320px]">
            {matricula ? `A matrícula ${matricula} ` : 'Esta viatura '}
            não está associada a uma viatura no Cartrack, ou a integração ainda não sincronizou.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Funde a posição ao vivo (se ligado) sobre os dados da BD.
  const lp =
    live && livePositions?.length
      ? livePositions.find((p) => plateKey(p.registration) === plateKey(v.registration))
      : undefined;
  const view = lp
    ? {
        ...v,
        last_latitude: lp.latitude ?? v.last_latitude,
        last_longitude: lp.longitude ?? v.last_longitude,
        speed: lp.speed ?? v.speed,
        ignition: lp.ignition ?? v.ignition,
        odometer: lp.odometer ?? v.odometer,
        last_position_at: lp.event_ts ?? v.last_position_at,
      }
    : v;

  const positioned = hasValidPosition(view);
  const hasFuel = view.fuel_percent != null || view.fuel_level != null;

  return (
    <div className="space-y-4">
      {/* Cabeçalho + ao vivo + sincronizar */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Localização Cartrack de <strong>{view.registration || matricula}</strong>
          {live && <span className="ml-2 text-emerald-600">● ao vivo (10s)</span>}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant={live ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setLive((s) => !s)}
            title={live ? 'Desligar tempo real' : 'Seguir em tempo real (10s)'}
          >
            <span
              className={`h-2 w-2 rounded-full ${live ? 'bg-white animate-pulse' : 'bg-emerald-500'}`}
            />
            Ao vivo
          </Button>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={Gauge}
          label="Odómetro"
          value={
            view.odometer != null ? `${Math.round(view.odometer).toLocaleString('pt-PT')} km` : '—'
          }
        />
        <Stat
          icon={Fuel}
          label="Combustível"
          value={
            view.fuel_percent != null
              ? `${Math.round(view.fuel_percent)}%`
              : hasFuel
                ? '—'
                : 'S/ sensor'
          }
          sub={view.fuel_level != null ? `${Math.round(view.fuel_level)} L` : undefined}
        />
        <Stat
          icon={Power}
          label="Estado"
          value={
            view.ignition == null ? '—' : view.ignition ? 'Ignição ligada' : 'Ignição desligada'
          }
          sub={view.speed != null && view.speed > 0 ? `${Math.round(view.speed)} km/h` : 'Parada'}
        />
        <Stat icon={Clock} label="Última posição" value={fmtDate(view.last_position_at)} />
      </div>

      {/* Mapa (só esta viatura) */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {positioned ? (
            <div className="h-[360px] isolate">
              <MapContainer
                center={[view.last_latitude as number, view.last_longitude as number]}
                zoom={15}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {live && (
                  <Recenter
                    lat={view.last_latitude as number}
                    lng={view.last_longitude as number}
                  />
                )}
                <Marker
                  key={`${view.last_latitude},${view.last_longitude}`}
                  position={[view.last_latitude as number, view.last_longitude as number]}
                  icon={carIcon}
                >
                  <Popup>
                    <div className="space-y-1">
                      <p className="font-semibold text-sm">{view.registration || matricula}</p>
                      {view.odometer != null && (
                        <p className="text-xs">
                          {Math.round(view.odometer).toLocaleString('pt-PT')} km
                        </p>
                      )}
                      <p className="text-xs">{fmtDate(view.last_position_at)}</p>
                    </div>
                  </Popup>
                </Marker>
              </MapContainer>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-center h-[240px]">
              <MapPin className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Sem posição GPS disponível.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
