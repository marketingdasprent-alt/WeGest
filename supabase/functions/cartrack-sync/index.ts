import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CARTRACK_REGION = 'pt';
const CARTRACK_API_BASE = `https://fleetapi-${CARTRACK_REGION}.cartrack.com/rest`;

function toArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.data || data?.vehicles || data?.trips || data?.events || data?.results || [];
}

function pick(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj?.[k] !== null && obj?.[k] !== '') return obj[k];
  }
  return null;
}

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normPlate(v: any): string {
  return String(v ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// Preserva dados parciais quando apenas uma secção da API falha.
async function fetchAll(
  path: string,
  auth: string,
  extraParams: Record<string, string> = {},
  onFalha?: (msg: string) => void
): Promise<any[]> {
  let all: any[] = [];
  let page = 1;
  const limit = 100;
  while (page <= 50) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...extraParams,
    });
    const url = `${CARTRACK_API_BASE}/${path}?${params.toString()}`;
    const resp = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
    if (!resp.ok) {
      const err = await resp.text();
      const msg = `${path} → HTTP ${resp.status}: ${err.slice(0, 200)}`;
      console.error(`Cartrack ${msg} (página ${page})`);
      onFalha?.(msg);
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Trips é opt-in porque o histórico completo pode exceder o IDLE_TIMEOUT de 150 s.
    const { integracao_id, date_from, date_to, positions_only, incluir_trips } = await req.json();

    if (!integracao_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'integracao_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: config, error: configError } = await supabase
      .from('plataformas_configuracao')
      .select('*')
      .eq('id', integracao_id)
      .eq('plataforma', 'cartrack')
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: 'Integração Cartrack não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!config.client_id || !config.client_secret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Credenciais Cartrack não configuradas' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orgId = config.org_id;
    const auth = 'Basic ' + btoa(`${config.client_id}:${config.client_secret}`);

    const { data: viaturas } = await supabase
      .from('viaturas')
      .select('id, matricula, km_atual')
      .eq('org_id', orgId);

    const plateToViatura = new Map<string, { id: string; km_atual: number | null }>();
    (viaturas || []).forEach((v: any) => {
      if (v.matricula)
        plateToViatura.set(normPlate(v.matricula), { id: v.id, km_atual: v.km_atual });
    });

    const matchViatura = (registration: any): string | null =>
      plateToViatura.get(normPlate(registration))?.id ?? null;

    // Janela curta mantém o cron dentro do IDLE_TIMEOUT; backfills passam datas explícitas.
    const DIAS_JANELA_PADRAO = 2;
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - DIAS_JANELA_PADRAO * 24 * 60 * 60 * 1000);
    const dateFrom = date_from || defaultFrom.toISOString().slice(0, 10);
    const dateTo = date_to || now.toISOString().slice(0, 10);

    const result = {
      vehicles: {
        total: 0,
        upserted: 0,
        matched: 0,
        km_atualizado: 0,
        errors: 0,
        erro_api: null as string | null,
      },
      trips: { total: 0, upserted: 0, errors: 0, erro_api: null as string | null },
      events: { total: 0, upserted: 0, errors: 0, erro_api: null as string | null },
      ms: { api: 0, upsert: 0, km: 0, total: 0 },
    };
    const tTotal0 = Date.now();

    const falhaEm = (secao: 'vehicles' | 'trips' | 'events') => (msg: string) => {
      result[secao].errors++;
      result[secao].erro_api = msg;
    };

    // O estado traz GPS e odómetro; pedir ambos em paralelo evita latência sequencial.
    const tApi0 = Date.now();
    const [vehicles, statuses] = await Promise.all([
      fetchAll('vehicles', auth, {}, falhaEm('vehicles')),
      fetchAll('vehicles/status', auth, { odometer_in_km: 'true' }, falhaEm('vehicles')),
    ]);
    result.ms.api = Date.now() - tApi0;
    result.vehicles.total = vehicles.length;

    const statusByVid = new Map<string, any>();
    const statusByReg = new Map<string, any>();
    for (const s of statuses) {
      const vid = pick(s, ['vehicle_id', 'vehicleId', 'id']);
      if (vid !== null) statusByVid.set(String(vid), s);
      const reg = pick(s, ['registration']);
      if (reg) statusByReg.set(normPlate(reg), s);
    }

    // Preparar e gravar em lote evita centenas de chamadas sequenciais à base de dados.
    type LinhaViatura = {
      row: Record<string, unknown>;
      viaturaId: string | null;
      odometer: number | null;
      plate: string;
    };
    const linhas: LinhaViatura[] = [];

    for (const v of vehicles) {
      const vid = pick(v, ['vehicle_id', 'vehicleId', 'id']);
      const externalId = vid ?? pick(v, ['terminal_serial', 'registration']);
      if (externalId === null) {
        result.vehicles.errors++;
        continue;
      }
      const registration = pick(v, [
        'registration',
        'license_plate',
        'licensePlate',
        'reg_number',
        'plate',
      ]);
      const viaturaId = matchViatura(registration);

      const st =
        (vid !== null ? statusByVid.get(String(vid)) : null) ||
        (registration ? statusByReg.get(normPlate(registration)) : null) ||
        {};
      const loc = st.location || {};

      const odometer = toNum(pick(st, ['odometer'])); // A API devolve km porque odometer_in_km=true.
      const lat = toNum(pick(loc, ['latitude', 'lat']));
      const lng = toNum(pick(loc, ['longitude', 'lng', 'lon']));
      const positionAt = pick(loc, ['updated']) || pick(st, ['event_ts']);
      const speed = toNum(pick(st, ['speed']));
      const ignitionRaw = pick(st, ['ignition']);
      const ignition =
        ignitionRaw === null
          ? null
          : ignitionRaw === true ||
            ignitionRaw === 'true' ||
            ignitionRaw === 1 ||
            ignitionRaw === '1';

      linhas.push({
        row: {
          integracao_id,
          org_id: orgId,
          cartrack_vehicle_id: String(externalId),
          registration: registration ? String(registration) : null,
          chassis: pick(v, ['chassis', 'chassis_number', 'vin']),
          descricao:
            pick(v, ['vehicle_name', 'description', 'name']) ||
            [pick(v, ['manufacturer']), pick(v, ['model'])].filter(Boolean).join(' ') ||
            null,
          odometer,
          last_latitude: lat,
          last_longitude: lng,
          last_position_at: positionAt || null,
          speed,
          ignition,
          status: pick(st, ['engine_type']) || pick(v, ['status', 'vehicle_status', 'state']),
          viatura_id: viaturaId,
          raw_data: { vehicle: v, status: st },
          updated_at: new Date().toISOString(),
        },
        viaturaId,
        odometer,
        plate: normPlate(registration),
      });
    }

    // Um upsert em lote falha se a mesma chave de conflito ocorrer duas vezes; conserva-se a última.
    const porChave = new Map<string, LinhaViatura>();
    for (const l of linhas) porChave.set(String(l.row.cartrack_vehicle_id), l);
    const unicas = [...porChave.values()];

    // Limita os pedidos porque raw_data completo pode tornar o corpo do upsert demasiado grande.
    const tUpsert0 = Date.now();
    const LOTE = 100;
    const gravadas: LinhaViatura[] = [];
    for (let i = 0; i < unicas.length; i += LOTE) {
      const lote = unicas.slice(i, i + LOTE);
      const { error: upErr } = await supabase.from('cartrack_vehicles').upsert(
        lote.map((l) => l.row),
        { onConflict: 'integracao_id,cartrack_vehicle_id' }
      );

      if (!upErr) {
        gravadas.push(...lote);
        continue;
      }

      // Isola erros de lote para gravar as linhas válidas sem perder a causa individual.
      console.error('Upsert cartrack_vehicles (lote):', upErr);
      for (const l of lote) {
        const { error: e1 } = await supabase
          .from('cartrack_vehicles')
          .upsert(l.row, { onConflict: 'integracao_id,cartrack_vehicle_id' });
        if (e1) {
          console.error('Upsert cartrack_vehicles:', e1);
          result.vehicles.errors++;
        } else {
          gravadas.push(l);
        }
      }
    }
    result.vehicles.upserted = gravadas.length;
    result.vehicles.matched = gravadas.filter((l) => l.viaturaId).length;
    result.ms.upsert = Date.now() - tUpsert0;

    // Um upsert parcial em viaturas falha nas colunas NOT NULL; updates concorrentes reduzem a latência.
    const tKm0 = Date.now();
    const kmParaAtualizar = gravadas.filter((l) => {
      if (!l.viaturaId || l.odometer === null) return false;
      const atual = plateToViatura.get(l.plate)?.km_atual ?? null;
      return atual === null || l.odometer > atual;
    });
    const CONCORRENTES = 20;
    for (let i = 0; i < kmParaAtualizar.length; i += CONCORRENTES) {
      const grupo = kmParaAtualizar.slice(i, i + CONCORRENTES);
      const res = await Promise.all(
        grupo.map((l) =>
          supabase
            .from('viaturas')
            .update({ km_atual: Math.round(l.odometer as number) })
            .eq('id', l.viaturaId as string)
        )
      );
      result.vehicles.km_atualizado += res.filter((r) => !r.error).length;
    }
    result.ms.km = Date.now() - tKm0;

    if (!positions_only && incluir_trips === true) {
      // Cartrack exige start_timestamp/end_timestamp em Y-m-d H:i:s; nomes errados devolvem 422.
      const trips = await fetchAll(
        'trips',
        auth,
        { start_timestamp: `${dateFrom} 00:00:00`, end_timestamp: `${dateTo} 23:59:59` },
        falhaEm('trips')
      );
      result.trips.total = trips.length;

      for (const t of trips) {
        const tripId = pick(t, ['id', 'trip_id', 'tripId']);
        if (tripId === null) {
          result.trips.errors++;
          continue;
        }
        const registration = pick(t, [
          'registration',
          'license_plate',
          'licensePlate',
          'reg_number',
          'plate',
        ]);

        // A API usa estes nomes para timestamps e duração; alternativas cobrem dados legados.
        // trip_distance vem em metros, mas cartrack_trips armazena quilómetros.
        // Cartrack aninha coordenadas; o fallback cobre respostas legadas.
        const distanciaMetros = toNum(pick(t, ['trip_distance']));
        const coordIni = (t as Record<string, unknown>)?.start_coordinates ?? {};
        const coordFim = (t as Record<string, unknown>)?.end_coordinates ?? {};

        const { error: upErr } = await supabase.from('cartrack_trips').upsert(
          {
            integracao_id,
            org_id: orgId,
            trip_id: String(tripId),
            cartrack_vehicle_id: (() => {
              const vid = pick(t, ['vehicle_id', 'vehicleId', 'id_vehicle']);
              return vid !== null ? String(vid) : null;
            })(),
            registration: registration ? String(registration) : null,
            viatura_id: matchViatura(registration),
            driver_name: pick(t, ['driver_name', 'driver', 'driverName']),
            start_at:
              pick(t, ['start_timestamp', 'start_time', 'start_ts', 'started_at', 'trip_start']) ||
              null,
            end_at:
              pick(t, ['end_timestamp', 'end_time', 'end_ts', 'ended_at', 'trip_end']) || null,
            start_latitude:
              toNum(pick(coordIni, ['latitude', 'lat'])) ??
              toNum(pick(t, ['start_latitude', 'start_lat'])),
            start_longitude:
              toNum(pick(coordIni, ['longitude', 'lng', 'lon'])) ??
              toNum(pick(t, ['start_longitude', 'start_lng', 'start_lon'])),
            end_latitude:
              toNum(pick(coordFim, ['latitude', 'lat'])) ??
              toNum(pick(t, ['end_latitude', 'end_lat'])),
            end_longitude:
              toNum(pick(coordFim, ['longitude', 'lng', 'lon'])) ??
              toNum(pick(t, ['end_longitude', 'end_lng', 'end_lon'])),
            distance_km:
              distanciaMetros !== null
                ? distanciaMetros / 1000
                : toNum(pick(t, ['distance_km', 'distance', 'km', 'mileage'])),
            duration_seconds: toNum(
              pick(t, ['trip_duration_seconds', 'duration_seconds', 'duration', 'duration_sec'])
            ),
            max_speed: toNum(pick(t, ['max_speed', 'top_speed', 'maxSpeed'])),
            odometer_start: toNum(pick(t, ['odometer_start', 'start_odometer'])),
            odometer_end: toNum(pick(t, ['odometer_end', 'end_odometer'])),
            raw_data: t,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'integracao_id,trip_id' }
        );
        if (upErr) {
          console.error('Upsert cartrack_trips:', upErr);
          result.trips.errors++;
        } else {
          result.trips.upserted++;
        }
      }

      // Sem o âmbito vehicle-events, a API devolve 403; manter a chamada recupera após alargar a role.
      const events = await fetchAll(
        'vehicle-events',
        auth,
        { start_timestamp: `${dateFrom} 00:00:00`, end_timestamp: `${dateTo} 23:59:59` },
        falhaEm('events')
      );
      result.events.total = events.length;

      for (const e of events) {
        const eventId = pick(e, ['id', 'event_id', 'eventId']);
        if (eventId === null) {
          result.events.errors++;
          continue;
        }
        const registration = pick(e, [
          'registration',
          'license_plate',
          'licensePlate',
          'reg_number',
          'plate',
        ]);
        const { error: upErr } = await supabase.from('cartrack_events').upsert(
          {
            integracao_id,
            org_id: orgId,
            event_id: String(eventId),
            cartrack_vehicle_id: (() => {
              const vid = pick(e, ['vehicle_id', 'vehicleId', 'id_vehicle']);
              return vid !== null ? String(vid) : null;
            })(),
            registration: registration ? String(registration) : null,
            viatura_id: matchViatura(registration),
            event_type: pick(e, ['event_type', 'type', 'eventType', 'alert_type']),
            description: pick(e, ['description', 'message', 'event_description', 'name']),
            event_at: pick(e, ['event_time', 'event_ts', 'timestamp', 'occurred_at']) || null,
            latitude: toNum(pick(e, ['latitude', 'lat'])),
            longitude: toNum(pick(e, ['longitude', 'lng', 'lon'])),
            raw_data: e,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'integracao_id,event_id' }
        );
        if (upErr) {
          console.error('Upsert cartrack_events:', upErr);
          result.events.errors++;
        } else {
          result.events.upserted++;
        }
      }
    }

    await supabase
      .from('plataformas_configuracao')
      .update({ ultimo_sync: new Date().toISOString() })
      .eq('id', integracao_id);

    result.ms.total = Date.now() - tTotal0;

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Erro cartrack-sync:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
