import { createClient } from "npm:@supabase/supabase-js@2.105.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface UberDriver {
  id: string;
  uber_driver_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  integracao_id: string | null;
  motorista_id: string | null;
}

// Normalize name to first+last, strip accents
function normalizeFirstLast(name: string): string {
  const stripped = name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
  const parts = stripped.split(" ");
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1]}`;
  return parts[0] || "";
}

interface AutoMapResult {
  success: boolean;
  mapped: number;
  skipped: number;
  errors: string[];
  details: {
    uber_driver_id: string;
    driver_name: string;
    action: "mapped" | "skipped";
    motorista_id?: string;
    reason?: string;
  }[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { integracao_id } = await req.json();

    if (!integracao_id) {
      return new Response(
        JSON.stringify({ success: false, error: "integracao_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[uber-auto-map-drivers] Iniciando auto-mapeamento para integração: ${integracao_id}`);

    // 0. Obter org_id da integração para filtrar motoristas da mesma org
    const { data: integConfig } = await supabase
      .from("plataformas_configuracao")
      .select("org_id")
      .eq("id", integracao_id)
      .single();

    const orgId = integConfig?.org_id;
    if (!orgId) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração sem org_id associado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Buscar todos os uber_drivers sem mapeamento para esta integração
    const { data: unmappedDrivers, error: driversError } = await supabase
      .from("uber_drivers")
      .select("*")
      .eq("integracao_id", integracao_id)
      .is("motorista_id", null);

    if (driversError) {
      console.error("[uber-auto-map-drivers] Erro ao buscar drivers:", driversError);
      throw driversError;
    }

    console.log(`[uber-auto-map-drivers] Encontrados ${unmappedDrivers?.length || 0} drivers não mapeados`);

    const result: AutoMapResult = {
      success: true,
      mapped: 0,
      skipped: 0,
      errors: [],
      details: [],
    };

    if (!unmappedDrivers || unmappedDrivers.length === 0) {
      return new Response(
        JSON.stringify({ ...result, message: "Nenhum motorista Uber para mapear" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Processar cada driver
    for (const driver of unmappedDrivers as UberDriver[]) {
      const driverName = driver.full_name || 
        `${driver.first_name || ""} ${driver.last_name || ""}`.trim() ||
        "Sem nome";

      try {
        // 3. Procurar motorista existente por vários critérios
        let existingMotorista: { id: string; nome: string } | null = null;

        // 3a. Tentar por email se disponível (Uber drivers table might not have email directly in all cases)
        // We check the raw_transaction if available in the future, 
        // but for now we rely on name and phone matching.

        // 3b. Tentar por combinação de Telefone + Nome (Resolve casos de telefones partilhados)
        // Note: uber_drivers table doesn't have a phone field directly, but let's see if we can find it in transactions
        // For now, we'll implement fuzzy name matching which is the main target.

        // 3c. Tentar por nome exacto (ignora acentos e case, filtrar por org)
        if (driverName !== "Sem nome") {
          const { data, error } = await supabase
            .from("motoristas_ativos")
            .select("id, nome")
            .eq("org_id", orgId)
            .ilike("nome", driverName)
            .maybeSingle();
          
          if (data) existingMotorista = data;
        }

        // 3d. Se não encontrou por nome exacto, tentar por first+last normalizado (filtrar por org)
        if (!existingMotorista && driverName !== "Sem nome") {
          const driverFL = normalizeFirstLast(driverName);
          if (driverFL.includes(" ")) {
            const { data: allMot, error: allErr } = await supabase
              .from("motoristas_ativos")
              .select("id, nome")
              .eq("org_id", orgId);
            
            if (!allErr && allMot) {
              const match = allMot.find((m: any) => normalizeFirstLast(m.nome) === driverFL);
              if (match) existingMotorista = match;
            }
          }
        }

        if (existingMotorista) {
          // 4. Match encontrado - Actualizar uber_drivers com o motorista_id
          const { error: updateError } = await supabase
            .from("uber_drivers")
            .update({ motorista_id: existingMotorista.id })
            .eq("id", driver.id);

          if (updateError) {
            console.error(`[uber-auto-map-drivers] Erro ao actualizar uber_drivers:`, updateError);
            result.errors.push(`Erro ao actualizar driver ${driver.uber_driver_id}: ${updateError.message}`);
            continue;
          }

          result.mapped++;
          result.details.push({
            uber_driver_id: driver.uber_driver_id,
            driver_name: driverName,
            action: "mapped",
            motorista_id: existingMotorista.id,
          });
          
          // Auto-save uber_uuid to motoristas_ativos if not present
          const { error: updateMotError } = await supabase
            .from("motoristas_ativos")
            .update({ uber_uuid: driver.uber_driver_id })
            .eq("id", existingMotorista.id)
            .is("uber_uuid", null);

          if (updateMotError) {
            console.warn(`[uber-auto-map-drivers] Falha ao auto-gravar uber_uuid para ${driverName}:`, updateMotError.message);
          } else {
            console.log(`[uber-auto-map-drivers] Uber UUID auto-gravado para ${driverName}`);
          }

          console.log(`[uber-auto-map-drivers] Match encontrado: ${driverName} → ${existingMotorista.nome}`);
        } else {
          result.skipped++;
          result.details.push({
            uber_driver_id: driver.uber_driver_id,
            driver_name: driverName,
            action: "skipped",
            reason: "Nenhuma correspondência encontrada",
          });
        }

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Erro processando ${driver.uber_driver_id}: ${errorMsg}`);
        console.error(`[uber-auto-map-drivers] Erro:`, err);
      }
    }

    const message = `Auto-mapeamento Uber concluído: ${result.mapped} mapeados, ${result.skipped} pulados`;
    console.log(`[uber-auto-map-drivers] ${message}`);

    return new Response(
      JSON.stringify({ ...result, message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[uber-auto-map-drivers] Erro geral:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Erro desconhecido" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
