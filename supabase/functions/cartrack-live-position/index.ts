import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CARTRACK_REGION = "pt";
const CARTRACK_API_BASE = `https://fleetapi-${CARTRACK_REGION}.cartrack.com/rest`;

function toArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.data || data?.vehicles || data?.results || [];
}
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

// Posição ao vivo do Cartrack (poll leve, sem escrever na BD). Usado pelo modo
// "Ao vivo" do mapa/tab. Se `registration` for passado, devolve só essa viatura.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { integracao_id, registration } = await req.json();
    if (!integracao_id) {
      return new Response(
        JSON.stringify({ success: false, error: "integracao_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: config } = await supabase
      .from("plataformas_configuracao")
      .select("client_id, client_secret")
      .eq("id", integracao_id)
      .eq("plataforma", "cartrack")
      .single();

    if (!config?.client_id || !config?.client_secret) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais Cartrack não configuradas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const auth = "Basic " + btoa(`${config.client_id}:${config.client_secret}`);

    // Uma viatura → 1 chamada filtrada. Frota → paginação (máx 5 páginas).
    let rows: any[] = [];
    let page = 1;
    const maxPages = registration ? 1 : 5;
    while (page <= maxPages) {
      const params = new URLSearchParams({
        odometer_in_km: "true",
        page: String(page),
        limit: "100",
      });
      if (registration) params.set("filter[registration]", String(registration));
      const resp = await fetch(`${CARTRACK_API_BASE}/vehicles/status?${params.toString()}`, {
        headers: { Authorization: auth, Accept: "application/json" },
      });
      if (!resp.ok) {
        const err = await resp.text();
        return new Response(
          JSON.stringify({ success: false, error: `API Cartrack ${resp.status}`, details: err.slice(0, 300) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const batch = toArray(await resp.json());
      if (!batch.length) break;
      rows = rows.concat(batch);
      if (batch.length < 100) break;
      page++;
    }

    const positions = rows.map((s: any) => {
      const loc = s.location || {};
      const ign = pick(s, ["ignition"]);
      return {
        registration: pick(s, ["registration"]),
        latitude: toNum(pick(loc, ["latitude", "lat"])),
        longitude: toNum(pick(loc, ["longitude", "lng", "lon"])),
        speed: toNum(pick(s, ["speed"])),
        ignition: ign === null ? null : ign === true || ign === "true" || ign === 1 || ign === "1",
        odometer: toNum(pick(s, ["odometer"])),
        event_ts: pick(loc, ["updated"]) || pick(s, ["event_ts"]),
      };
    });

    return new Response(
      JSON.stringify({ success: true, positions }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro cartrack-live-position:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
