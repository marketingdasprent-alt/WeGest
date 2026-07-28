import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Cartrack Fleet API — HTTP Basic Auth. Base URL por região (ISO alpha-2).
// Portugal = fleetapi-pt.cartrack.com. Ver developer.cartrack.com.
const CARTRACK_REGION = "pt";
const CARTRACK_API_BASE = `https://fleetapi-${CARTRACK_REGION}.cartrack.com/rest`;

// Extrai um array da resposta, seja qual for o envelope usado pela API.
function toArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.data || data?.vehicles || data?.trips || data?.events || data?.results || [];
}

// Primeiro valor não-nulo entre várias chaves candidatas (nomes da API incertos).
function pick(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj?.[k] !== null && obj?.[k] !== "") return obj[k];
  }
  return null;
}

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Normaliza matrícula para comparação (maiúsculas, sem separadores).
function normPlate(v: any): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Paginação genérica de um recurso da Fleet API.
async function fetchAll(
  path: string,
  auth: string,
  extraParams: Record<string, string> = {},
): Promise<any[]> {
  let all: any[] = [];
  let page = 1;
  const limit = 100;
  while (page <= 50) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit), ...extraParams });
    const url = `${CARTRACK_API_BASE}/${path}?${params.toString()}`;
    const resp = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`Cartrack ${path} page ${page} → ${resp.status}: ${err.slice(0, 300)}`);
      break;
    }
    const rows = toArray(await resp.json());
    if (!Array.isArray(rows) || rows.length === 0) break;
    all = all.concat(rows);
    if (rows.length < limit) break;
    page++;
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // positions_only: sync rápido só de viaturas/posição/odómetro (salta
    // trips/events, que são a parte lenta). Usado pelo botão "atualizar" do mapa.
    const { integracao_id, date_from, date_to, positions_only } = await req.json();

    if (!integracao_id) {
      return new Response(
        JSON.stringify({ success: false, error: "integracao_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Config da integração
    const { data: config, error: configError } = await supabase
      .from("plataformas_configuracao")
      .select("*")
      .eq("id", integracao_id)
      .eq("plataforma", "cartrack")
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração Cartrack não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!config.client_id || !config.client_secret) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais Cartrack não configuradas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = config.org_id;
    const auth = "Basic " + btoa(`${config.client_id}:${config.client_secret}`);

    // 2. Mapa matrícula → viatura (para ligar dados Cartrack às viaturas WeGest)
    const { data: viaturas } = await supabase
      .from("viaturas")
      .select("id, matricula, km_atual")
      .eq("org_id", orgId);

    const plateToViatura = new Map<string, { id: string; km_atual: number | null }>();
    (viaturas || []).forEach((v: any) => {
      if (v.matricula) plateToViatura.set(normPlate(v.matricula), { id: v.id, km_atual: v.km_atual });
    });

    const matchViatura = (registration: any): string | null =>
      plateToViatura.get(normPlate(registration))?.id ?? null;

    // Janela de datas para trips/events (a API limita tipicamente a 31 dias).
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateFrom = date_from || defaultFrom.toISOString().slice(0, 10);
    const dateTo = date_to || now.toISOString().slice(0, 10);

    const result = {
      vehicles: { total: 0, upserted: 0, matched: 0, km_atualizado: 0, errors: 0 },
      trips: { total: 0, upserted: 0, errors: 0 },
      events: { total: 0, upserted: 0, errors: 0 },
    };

    // 3. VEHICLES — registo estático (/vehicles) + estado/posição (/vehicles/status).
    // O /vehicles só traz metadados (matrícula, modelo, chassis, vehicle_id).
    // O odómetro e a posição GPS vêm do /vehicles/status, num objeto `location`
    // aninhado; odometer_in_km=true devolve o odómetro já em km.
    const vehicles = await fetchAll("vehicles", auth);
    result.vehicles.total = vehicles.length;

    const statuses = await fetchAll("vehicles/status", auth, { odometer_in_km: "true" });
    const statusByVid = new Map<string, any>();
    const statusByReg = new Map<string, any>();
    for (const s of statuses) {
      const vid = pick(s, ["vehicle_id", "vehicleId", "id"]);
      if (vid !== null) statusByVid.set(String(vid), s);
      const reg = pick(s, ["registration"]);
      if (reg) statusByReg.set(normPlate(reg), s);
    }

    for (const v of vehicles) {
      const vid = pick(v, ["vehicle_id", "vehicleId", "id"]);
      const externalId = vid ?? pick(v, ["terminal_serial", "registration"]);
      if (externalId === null) {
        result.vehicles.errors++;
        continue;
      }
      const registration = pick(v, ["registration", "license_plate", "licensePlate", "reg_number", "plate"]);
      const viaturaId = matchViatura(registration);

      // Estado correspondente (por vehicle_id, fallback por matrícula).
      const st =
        (vid !== null ? statusByVid.get(String(vid)) : null) ||
        (registration ? statusByReg.get(normPlate(registration)) : null) ||
        {};
      const loc = st.location || {};

      const odometer = toNum(pick(st, ["odometer"])); // já em km (odometer_in_km=true)
      const lat = toNum(pick(loc, ["latitude", "lat"]));
      const lng = toNum(pick(loc, ["longitude", "lng", "lon"]));
      const positionAt = pick(loc, ["updated"]) || pick(st, ["event_ts"]);
      const speed = toNum(pick(st, ["speed"]));
      const ignitionRaw = pick(st, ["ignition"]);
      const ignition =
        ignitionRaw === null
          ? null
          : ignitionRaw === true || ignitionRaw === "true" || ignitionRaw === 1 || ignitionRaw === "1";

      const { error: upErr } = await supabase.from("cartrack_vehicles").upsert(
        {
          integracao_id,
          org_id: orgId,
          cartrack_vehicle_id: String(externalId),
          registration: registration ? String(registration) : null,
          chassis: pick(v, ["chassis", "chassis_number", "vin"]),
          descricao:
            pick(v, ["vehicle_name", "description", "name"]) ||
            [pick(v, ["manufacturer"]), pick(v, ["model"])].filter(Boolean).join(" ") ||
            null,
          odometer,
          last_latitude: lat,
          last_longitude: lng,
          last_position_at: positionAt || null,
          speed,
          ignition,
          status: pick(st, ["engine_type"]) || pick(v, ["status", "vehicle_status", "state"]),
          viatura_id: viaturaId,
          raw_data: { vehicle: v, status: st },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "integracao_id,cartrack_vehicle_id" }
      );

      if (upErr) {
        console.error("Upsert cartrack_vehicles:", upErr);
        result.vehicles.errors++;
        continue;
      }
      result.vehicles.upserted++;
      if (viaturaId) result.vehicles.matched++;

      // Actualizar km_atual da viatura (só se o odómetro Cartrack for maior/mais recente)
      if (viaturaId && odometer !== null) {
        const current = plateToViatura.get(normPlate(registration))?.km_atual ?? null;
        if (current === null || odometer > current) {
          const { error: kmErr } = await supabase
            .from("viaturas")
            .update({ km_atual: Math.round(odometer) })
            .eq("id", viaturaId);
          if (!kmErr) result.vehicles.km_atualizado++;
        }
      }
    }

    // 4 + 5. TRIPS e EVENTS — histórico (parte lenta). Saltado no positions_only.
    if (!positions_only) {
    // 4. TRIPS — histórico de viagens
    const trips = await fetchAll("trips", auth, { date_from: dateFrom, date_to: dateTo });
    result.trips.total = trips.length;

    for (const t of trips) {
      const tripId = pick(t, ["id", "trip_id", "tripId"]);
      if (tripId === null) {
        result.trips.errors++;
        continue;
      }
      const registration = pick(t, ["registration", "license_plate", "licensePlate", "reg_number", "plate"]);
      const { error: upErr } = await supabase.from("cartrack_trips").upsert(
        {
          integracao_id,
          org_id: orgId,
          trip_id: String(tripId),
          cartrack_vehicle_id: (() => {
            const vid = pick(t, ["vehicle_id", "vehicleId", "id_vehicle"]);
            return vid !== null ? String(vid) : null;
          })(),
          registration: registration ? String(registration) : null,
          viatura_id: matchViatura(registration),
          driver_name: pick(t, ["driver_name", "driver", "driverName"]),
          start_at: pick(t, ["start_time", "start_ts", "started_at", "trip_start"]) || null,
          end_at: pick(t, ["end_time", "end_ts", "ended_at", "trip_end"]) || null,
          start_latitude: toNum(pick(t, ["start_latitude", "start_lat"])),
          start_longitude: toNum(pick(t, ["start_longitude", "start_lng", "start_lon"])),
          end_latitude: toNum(pick(t, ["end_latitude", "end_lat"])),
          end_longitude: toNum(pick(t, ["end_longitude", "end_lng", "end_lon"])),
          distance_km: toNum(pick(t, ["distance_km", "distance", "km", "mileage"])),
          duration_seconds: toNum(pick(t, ["duration_seconds", "duration", "duration_sec"])),
          max_speed: toNum(pick(t, ["max_speed", "top_speed", "maxSpeed"])),
          odometer_start: toNum(pick(t, ["odometer_start", "start_odometer"])),
          odometer_end: toNum(pick(t, ["odometer_end", "end_odometer"])),
          raw_data: t,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "integracao_id,trip_id" }
      );
      if (upErr) {
        console.error("Upsert cartrack_trips:", upErr);
        result.trips.errors++;
      } else {
        result.trips.upserted++;
      }
    }

    // 5. EVENTS — alertas/eventos
    const events = await fetchAll("vehicle-events", auth, { date_from: dateFrom, date_to: dateTo });
    result.events.total = events.length;

    for (const e of events) {
      const eventId = pick(e, ["id", "event_id", "eventId"]);
      if (eventId === null) {
        result.events.errors++;
        continue;
      }
      const registration = pick(e, ["registration", "license_plate", "licensePlate", "reg_number", "plate"]);
      const { error: upErr } = await supabase.from("cartrack_events").upsert(
        {
          integracao_id,
          org_id: orgId,
          event_id: String(eventId),
          cartrack_vehicle_id: (() => {
            const vid = pick(e, ["vehicle_id", "vehicleId", "id_vehicle"]);
            return vid !== null ? String(vid) : null;
          })(),
          registration: registration ? String(registration) : null,
          viatura_id: matchViatura(registration),
          event_type: pick(e, ["event_type", "type", "eventType", "alert_type"]),
          description: pick(e, ["description", "message", "event_description", "name"]),
          event_at: pick(e, ["event_time", "event_ts", "timestamp", "occurred_at"]) || null,
          latitude: toNum(pick(e, ["latitude", "lat"])),
          longitude: toNum(pick(e, ["longitude", "lng", "lon"])),
          raw_data: e,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "integracao_id,event_id" }
      );
      if (upErr) {
        console.error("Upsert cartrack_events:", upErr);
        result.events.errors++;
      } else {
        result.events.upserted++;
      }
    }
    } // fim if (!positions_only)

    // 6. Timestamp do último sync
    await supabase
      .from("plataformas_configuracao")
      .update({ ultimo_sync: new Date().toISOString() })
      .eq("id", integracao_id);

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro cartrack-sync:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
