import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutoMapResult {
  success: boolean;
  mapped: number;
  created: number;
  skipped: number;
  errors: string[];
}

// Formatar matrícula para XX-XX-XX
function formatPlate(plate: string): string {
  const cleaned = plate.toUpperCase().replace(/[\s\-\.]/g, '').trim();
  if (cleaned.length === 6) {
    return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 4)}-${cleaned.slice(4, 6)}`;
  }
  return plate;
}

// Normalizar matrícula para comparação (sem hífens)
function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[\s\-\.]/g, '').trim();
}

// Extrair marca e modelo separados
function extractBrandAndModel(modelString: string | null): { marca: string; modelo: string } {
  if (!modelString) return { marca: "Desconhecida", modelo: "Desconhecido" };
  const parts = modelString.trim().split(' ');
  if (parts.length >= 2) {
    return {
      marca: parts[0],
      modelo: parts.slice(1).join(' '),
    };
  }
  return { marca: parts[0], modelo: parts[0] };
}

// Traduzir cor para português
function translateColor(color: string | null): string | null {
  if (!color) return null;
  const translations: Record<string, string> = {
    'black': 'Preto',
    'white': 'Branco',
    'gray': 'Cinza',
    'grey': 'Cinza',
    'silver': 'Prata',
    'red': 'Vermelho',
    'blue': 'Azul',
    'green': 'Verde',
    'yellow': 'Amarelo',
    'orange': 'Laranja',
    'brown': 'Castanho',
    'beige': 'Bege',
    'gold': 'Dourado',
    'purple': 'Roxo',
    'pink': 'Rosa',
  };
  return translations[color.toLowerCase()] || color;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const { integracao_id } = body;

    console.log(`[bolt-auto-map-vehicles] Iniciando auto-mapeamento${integracao_id ? ` para integração ${integracao_id}` : ''}`);

    // Obter org_id da integração. Quando integracao_id não é passado no
    // pedido, esta função processa veículos de VÁRIAS integrações (e
    // portanto várias orgs) na mesma corrida — por isso o org_id é
    // resolvido por veículo (orgIdCache), nunca assumido globalmente.
    const orgIdCache = new Map<string, string | null>();
    const resolveOrgId = async (integId: string | null | undefined): Promise<string | null> => {
      if (!integId) return null;
      if (orgIdCache.has(integId)) return orgIdCache.get(integId)!;
      const { data: integConfig } = await supabase
        .from("plataformas_configuracao")
        .select("org_id")
        .eq("id", integId)
        .single();
      const resolved = integConfig?.org_id || null;
      orgIdCache.set(integId, resolved);
      return resolved;
    };

    const result: AutoMapResult = {
      success: true,
      mapped: 0,
      created: 0,
      skipped: 0,
      errors: [],
    };

    // Buscar veículos Bolt sem mapeamento
    let query = supabase
      .from("bolt_vehicles")
      .select("id, vehicle_uuid, license_plate, brand, model, year, color, dados_raw, integracao_id")
      .is("viatura_id", null);

    if (integracao_id) {
      query = query.eq("integracao_id", integracao_id);
    }

    const { data: unmappedVehicles, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Erro ao buscar veículos: ${fetchError.message}`);
    }

    if (!unmappedVehicles || unmappedVehicles.length === 0) {
      console.log("[bolt-auto-map-vehicles] Nenhum veículo para mapear");
      return new Response(
        JSON.stringify({ ...result, message: "Nenhum veículo para mapear" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[bolt-auto-map-vehicles] ${unmappedVehicles.length} veículos para processar`);

    for (const vehicle of unmappedVehicles) {
      try {
        const rawData = vehicle.dados_raw as Record<string, any> | null;
        const plateToUse = vehicle.license_plate || rawData?.reg_number;
        
        if (!plateToUse) {
          result.skipped++;
          console.log(`[bolt-auto-map-vehicles] Veículo ${vehicle.vehicle_uuid} sem matrícula - pulado`);
          continue;
        }

        const vehicleOrgId = await resolveOrgId(vehicle.integracao_id ?? integracao_id);
        if (!vehicleOrgId) {
          result.skipped++;
          result.errors.push(`Veículo ${vehicle.vehicle_uuid}: não foi possível determinar a organização — pulado.`);
          continue;
        }

        const normalizedPlate = normalizePlate(plateToUse);
        const formattedPlate = formatPlate(plateToUse);

        // Procurar viatura existente por matrícula (normalizada, sempre filtrada por org)
        const { data: existingViatura } = await supabase
          .from("viaturas")
          .select("id, matricula")
          .or(`matricula.ilike.${normalizedPlate},matricula.ilike.${formattedPlate},matricula.ilike.${vehicle.license_plate}`)
          .eq("org_id", vehicleOrgId)
          .maybeSingle();

        let viaturaId: string;

        if (existingViatura) {
          viaturaId = existingViatura.id;
          result.mapped++;
          console.log(`[bolt-auto-map-vehicles] Veículo ${formattedPlate} mapeado para viatura existente ${viaturaId}`);
        } else {
          // Extrair marca e modelo do campo model da Bolt
          const modelString = vehicle.model || rawData?.model;
          const { marca, modelo } = extractBrandAndModel(modelString);
          
          // Traduzir cor para português
          const colorRaw = vehicle.color || rawData?.color;
          const cor = translateColor(colorRaw);

          // Criar nova viatura com dados formatados
          const { data: newViatura, error: insertError } = await supabase
            .from("viaturas")
            .insert({
              matricula: formattedPlate,
              marca: marca,
              modelo: modelo,
              ano: vehicle.year || rawData?.year || null,
              cor: cor,
              org_id: vehicleOrgId,
              observacoes: "Criada automaticamente via sincronização Bolt",
            })
            .select("id")
            .single();

          if (insertError) {
            result.errors.push(`Erro ao criar viatura ${formattedPlate}: ${insertError.message}`);
            console.error(`[bolt-auto-map-vehicles] Erro ao criar viatura:`, insertError);
            continue;
          }

          viaturaId = newViatura.id;
          result.created++;
          console.log(`[bolt-auto-map-vehicles] Nova viatura criada: ${formattedPlate} (${marca} ${modelo}, ${cor})`);
        }

        // Actualizar bolt_vehicles com o viatura_id
        const { error: updateError } = await supabase
          .from("bolt_vehicles")
          .update({ viatura_id: viaturaId })
          .eq("id", vehicle.id);

        if (updateError) {
          result.errors.push(`Erro ao actualizar bolt_vehicle ${vehicle.id}: ${updateError.message}`);
          console.error(`[bolt-auto-map-vehicles] Erro ao actualizar:`, updateError);
        }

      } catch (vehicleError) {
        const errorMsg = `Erro ao processar veículo ${vehicle.license_plate}: ${(vehicleError as Error).message}`;
        result.errors.push(errorMsg);
        console.error(`[bolt-auto-map-vehicles]`, errorMsg);
      }
    }

    console.log(`[bolt-auto-map-vehicles] Concluído: ${result.mapped} mapeados, ${result.created} criados, ${result.skipped} pulados`);

    return new Response(
      JSON.stringify({
        ...result,
        message: `Auto-map: ${result.mapped} mapeados, ${result.created} criados, ${result.skipped} pulados`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const message = (error as Error)?.message || "Erro inesperado";
    console.error("[bolt-auto-map-vehicles] Error:", message);

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
