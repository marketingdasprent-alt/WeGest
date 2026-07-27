import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Última posição/estado de cada viatura Cartrack (tabela cartrack_vehicles,
 * populada pelo edge function cartrack-sync). A ligação à viatura WeGest é
 * feita por matrícula no sync (viatura_id). RLS filtra por organização —
 * não é preciso filtrar org_id aqui.
 *
 * cartrack_vehicles ainda não está nos tipos gerados do Supabase, por isso a
 * query usa `supabase as any` (mesmo padrão de via_verde_contas).
 */
export interface CartrackVehicle {
  id: string;
  integracao_id: string | null;
  cartrack_vehicle_id: string;
  registration: string | null;
  descricao: string | null;
  odometer: number | null;
  last_latitude: number | null;
  last_longitude: number | null;
  last_position_at: string | null;
  speed: number | null;
  ignition: boolean | null;
  status: string | null;
  viatura_id: string | null;
}

export function useCartrackVehicles(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'cartrack-vehicles'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CartrackVehicle[]> => {
      const { data, error } = await (supabase as any)
        .from('cartrack_vehicles')
        .select(
          'id, integracao_id, cartrack_vehicle_id, registration, descricao, odometer, last_latitude, last_longitude, last_position_at, speed, ignition, status, viatura_id'
        )
        .order('registration', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CartrackVehicle[];
    },
  });
}

// Dados Cartrack de UMA viatura (para a tab Geolocalização), já com o
// combustível extraído do raw_data.status.fuel. Nota: a API Cartrack escreve
// "precentage_left" (typo da própria API) para a % de combustível.
export interface CartrackVehicleDetail extends CartrackVehicle {
  fuel_level: number | null; // litros
  fuel_percent: number | null; // 0-100
  fuel_updated: string | null;
}

export function useCartrackVehicleByViatura(viaturaId?: string | null) {
  return useQuery({
    queryKey: ['cartrack-vehicle-by-viatura', viaturaId],
    enabled: !!viaturaId,
    staleTime: 60_000,
    queryFn: async (): Promise<CartrackVehicleDetail | null> => {
      const { data, error } = await (supabase as any)
        .from('cartrack_vehicles')
        .select('*')
        .eq('viatura_id', viaturaId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const fuel = (data.raw_data?.status?.fuel ?? {}) as Record<string, unknown>;
      const toNum = (v: unknown) => (typeof v === 'number' ? v : null);
      return {
        ...(data as CartrackVehicle),
        fuel_level: toNum(fuel.level),
        fuel_percent: toNum(fuel.precentage_left),
        fuel_updated: (fuel.updated as string) ?? null,
      };
    },
  });
}

// ── Modo "Ao vivo" ──────────────────────────────────────────────
// Poll leve à API Cartrack (via cartrack-live-position), sem escrever na BD.
// A Cartrack não tem streaming/push — isto é o mais "tempo real" possível.
export interface LivePosition {
  registration: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  ignition: boolean | null;
  odometer: number | null;
  event_ts: string | null;
}

export function useCartrackLive(
  integracaoId: string | null | undefined,
  opts: { registration?: string | null; enabled: boolean; intervalMs?: number }
) {
  const { registration, enabled, intervalMs = 10_000 } = opts;
  return useQuery({
    queryKey: ['cartrack-live', integracaoId, registration ?? 'all'],
    enabled: enabled && !!integracaoId,
    refetchInterval: enabled ? intervalMs : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
    queryFn: async (): Promise<LivePosition[]> => {
      const { data, error } = await supabase.functions.invoke('cartrack-live-position', {
        body: { integracao_id: integracaoId, registration: registration ?? undefined },
      });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Falha ao obter posição ao vivo');
      }
      return (data.positions ?? []) as LivePosition[];
    },
  });
}

/** Chave de normalização de matrícula para cruzar live ↔ BD. */
export function plateKey(s: string | null | undefined): string {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Só as viaturas com coordenadas válidas (para desenhar no mapa). */
export function hasValidPosition(v: CartrackVehicle): boolean {
  return (
    typeof v.last_latitude === 'number' &&
    typeof v.last_longitude === 'number' &&
    !Number.isNaN(v.last_latitude) &&
    !Number.isNaN(v.last_longitude) &&
    !(v.last_latitude === 0 && v.last_longitude === 0)
  );
}
