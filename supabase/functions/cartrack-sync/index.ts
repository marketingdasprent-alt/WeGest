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
// `onFalha` existe porque, sem ele, uma resposta não-OK da API era
// indistinguível de "não há dados": o `break` abaixo devolvia lista vazia, o
// erro ia só para console.error (que não aparece nos logs de invocação) e o
// contador `errors` do resultado ficava a 0. Foi assim que `trips` e `events`
// estiveram a 0 com errors:0 sem ninguém poder saber se era limitação do plano
// Cartrack ou um endpoint errado. O caller decide o que fazer com a falha; a
// função continua a devolver o que conseguiu ler, para uma falha em trips não
// arrastar o sync de viaturas que funciona.
async function fetchAll(
  path: string,
  auth: string,
  extraParams: Record<string, string> = {},
  onFalha?: (msg: string) => void,
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // positions_only: sync rápido só de viaturas/posição/odómetro (salta
    // trips/events, que são a parte lenta). Usado pelo botão "atualizar" do mapa.
    // `incluir_trips` é opt-in de propósito, e a razão é um limite rígido da
    // plataforma. Enquanto o pedido de trips falhava com 422 (nomes de
    // parâmetro errados — ver mais abaixo), o sync completo levava ~35 s. Assim
    // que o 422 foi corrigido e a API passou a devolver viagens a sério, a mesma
    // invocação passou dos **150 s de IDLE_TIMEOUT** das edge functions, mesmo
    // com a janela reduzida a 2 dias: são 250 viaturas e milhares de viagens,
    // gravadas uma a uma. Nenhuma janela realista cabe numa só invocação.
    //
    // Trips precisa portanto do mesmo tratamento que a fila do Via Verde já usa
    // — trabalho em lotes ao longo de várias invocações — e isso é uma tarefa
    // por si. Até lá o sync de 15 minutos mantém-se rápido e fiável (viaturas,
    // posição e odómetro, que é o que alimenta o mapa e os alertas de
    // manutenção), e as viagens obtêm-se sob pedido com
    // {"incluir_trips": true, "date_from": "...", "date_to": "..."}.
    const { integracao_id, date_from, date_to, positions_only, incluir_trips } = await req.json();

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

    // Janela de datas para trips/events.
    //
    // 2 dias por omissão, não 30: este sync corre a cada 15 minutos (cron
    // cartrack-scheduled-sync) e as viagens são gravadas por upsert, logo uma
    // janela curta e rolante cobre tudo sem lacunas. Com 30 dias a função
    // passava dos 150 s de limite da plataforma (IDLE_TIMEOUT) assim que o
    // pedido de trips deixou de falhar — a janela larga só faz sentido num
    // backfill manual, que se obtém passando date_from/date_to explicitamente.
    const DIAS_JANELA_PADRAO = 2;
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - DIAS_JANELA_PADRAO * 24 * 60 * 60 * 1000);
    const dateFrom = date_from || defaultFrom.toISOString().slice(0, 10);
    const dateTo = date_to || now.toISOString().slice(0, 10);

    // `erro_api` distingue "a API devolveu lista vazia" de "a API recusou o
    // pedido". Sem este campo, total:0/errors:0 era ambíguo e escondia um 403.
    const result = {
      vehicles: { total: 0, upserted: 0, matched: 0, km_atualizado: 0, errors: 0, erro_api: null as string | null },
      trips: { total: 0, upserted: 0, errors: 0, erro_api: null as string | null },
      events: { total: 0, upserted: 0, errors: 0, erro_api: null as string | null },
      // Tempo por fase, em ms. Sem isto, um sync lento é um número só e não se
      // sabe se o custo está na API da Cartrack ou nas escritas — foi
      // exactamente essa a dúvida que obrigou a medir à mão da primeira vez.
      ms: { api: 0, upsert: 0, km: 0, total: 0 },
    };
    const tTotal0 = Date.now();

    // Registar a falha de fetch no contador da secção respectiva.
    const falhaEm = (secao: 'vehicles' | 'trips' | 'events') => (msg: string) => {
      result[secao].errors++;
      result[secao].erro_api = msg;
    };

    // 3. VEHICLES — registo estático (/vehicles) + estado/posição (/vehicles/status).
    // O /vehicles só traz metadados (matrícula, modelo, chassis, vehicle_id).
    // O odómetro e a posição GPS vêm do /vehicles/status, num objeto `location`
    // aninhado; odometer_in_km=true devolve o odómetro já em km.
    // As duas listagens não dependem uma da outra — pedidas em paralelo, o que
    // corta praticamente para metade o tempo passado à espera da Cartrack.
    const tApi0 = Date.now();
    const [vehicles, statuses] = await Promise.all([
      fetchAll("vehicles", auth, {}, falhaEm("vehicles")),
      fetchAll("vehicles/status", auth, { odometer_in_km: "true" }, falhaEm("vehicles")),
    ]);
    result.ms.api = Date.now() - tApi0;
    result.vehicles.total = vehicles.length;

    const statusByVid = new Map<string, any>();
    const statusByReg = new Map<string, any>();
    for (const s of statuses) {
      const vid = pick(s, ["vehicle_id", "vehicleId", "id"]);
      if (vid !== null) statusByVid.set(String(vid), s);
      const reg = pick(s, ["registration"]);
      if (reg) statusByReg.set(normPlate(reg), s);
    }

    // As linhas são montadas em memória e gravadas em lote a seguir. Antes disto
    // o ciclo fazia um upsert por viatura e ainda um update de km_atual por
    // viatura — até ~500 idas e voltas à base de dados em série, cada uma a
    // pagar a latência completa. Numa frota de 250 viaturas isso punha o botão
    // "sincronizar" do mapa nos ~40 s, tempo suficiente para quem carrega
    // desistir a meio e dar o sync como bloqueado.
    type LinhaViatura = {
      row: Record<string, unknown>;
      viaturaId: string | null;
      odometer: number | null;
      plate: string;
    };
    const linhas: LinhaViatura[] = [];

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

      linhas.push({
        row: {
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
        viaturaId,
        odometer,
        plate: normPlate(registration),
      });
    }

    // Deduplicar pela chave de conflito. O ciclo linha-a-linha tolerava a mesma
    // viatura repetida (o segundo upsert limitava-se a reescrever o primeiro),
    // mas num upsert em lote o Postgres rejeita o comando inteiro com "ON
    // CONFLICT DO UPDATE command cannot affect row a second time". Fica a
    // última ocorrência, que é a mais recente.
    const porChave = new Map<string, LinhaViatura>();
    for (const l of linhas) porChave.set(String(l.row.cartrack_vehicle_id), l);
    const unicas = [...porChave.values()];

    // 3a. Gravar as viaturas em lotes. 100 por lote e não tudo de uma vez
    // porque cada linha leva o `raw_data` completo (vehicle + status) — um
    // único pedido com a frota toda dá vários MB de corpo.
    const tUpsert0 = Date.now();
    const LOTE = 100;
    const gravadas: LinhaViatura[] = [];
    for (let i = 0; i < unicas.length; i += LOTE) {
      const lote = unicas.slice(i, i + LOTE);
      const { error: upErr } = await supabase
        .from("cartrack_vehicles")
        .upsert(lote.map((l) => l.row), { onConflict: "integracao_id,cartrack_vehicle_id" });

      if (!upErr) {
        gravadas.push(...lote);
        continue;
      }

      // Uma linha má não pode levar o lote todo à frente: repete-se linha-a-linha
      // só neste lote, para se perder apenas a que está de facto errada.
      console.error("Upsert cartrack_vehicles (lote):", upErr);
      for (const l of lote) {
        const { error: e1 } = await supabase
          .from("cartrack_vehicles")
          .upsert(l.row, { onConflict: "integracao_id,cartrack_vehicle_id" });
        if (e1) {
          console.error("Upsert cartrack_vehicles:", e1);
          result.vehicles.errors++;
        } else {
          gravadas.push(l);
        }
      }
    }
    result.vehicles.upserted = gravadas.length;
    result.vehicles.matched = gravadas.filter((l) => l.viaturaId).length;
    result.ms.upsert = Date.now() - tUpsert0;

    // 3b. km_atual das viaturas WeGest — só as que subiram de facto.
    // Continuam a ser updates individuais (cada uma tem o seu valor e o seu id,
    // e um upsert parcial em `viaturas` esbarraria nas colunas NOT NULL), mas
    // deixam de ser em série: em grupos de 20 concorrentes o custo passa a ser
    // a latência de um punhado de rondas em vez de uma por viatura.
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
            .from("viaturas")
            .update({ km_atual: Math.round(l.odometer as number) })
            .eq("id", l.viaturaId as string)
        )
      );
      result.vehicles.km_atualizado += res.filter((r) => !r.error).length;
    }
    result.ms.km = Date.now() - tKm0;

    // 4 + 5. TRIPS e EVENTS — histórico (parte lenta). Saltado no positions_only
    // e, por omissão, também no sync normal: ver a nota do `incluir_trips` no
    // topo (excede os 150 s de IDLE_TIMEOUT da plataforma com dados reais).
    if (!positions_only && incluir_trips === true) {
    // 4. TRIPS — histórico de viagens
    // A API de trips exige `start_timestamp`/`end_timestamp` no formato
    // `Y-m-d H:i:s` — não `date_from`/`date_to`, e não uma data sozinha. Ambos
    // os requisitos vieram dos 422 que ela própria devolve ("The start_timestamp
    // is required", depois "does not match the format Y-m-d H:i:s"). Com os
    // nomes errados a resposta era sempre 422 e, antes de `onFalha` existir,
    // isso aparecia como trips:0/errors:0 — indistinguível de "não há viagens".
    const trips = await fetchAll(
      "trips",
      auth,
      { start_timestamp: `${dateFrom} 00:00:00`, end_timestamp: `${dateTo} 23:59:59` },
      falhaEm("trips"),
    );
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
    // vehicle-events devolve HTTP 403 "Unauthorized for this role" com as
    // credenciais actuais — é uma limitação do lado da Cartrack (o utilizador
    // da API não tem esse âmbito), não um erro de parâmetros. Mantém-se a
    // chamada para a capacidade voltar sozinha se a role for alargada; o
    // erro_api do resultado diz porque está vazio, em vez de o esconder.
    const events = await fetchAll(
      "vehicle-events",
      auth,
      { start_timestamp: `${dateFrom} 00:00:00`, end_timestamp: `${dateTo} 23:59:59` },
      falhaEm("events"),
    );
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

    result.ms.total = Date.now() - tTotal0;

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
