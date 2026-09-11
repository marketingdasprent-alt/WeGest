import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { AuthorizationError, requireInternalRequest } from '../_shared/auth/edgeAuthorization.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOLT_API_BASE = "https://node.bolt.eu/fleet-integration-gateway";

function extractBrand(modelString: string | null): string | null {
  if (!modelString) return null;
  const parts = modelString.trim().split(' ');
  return parts.length > 0 ? parts[0] : null;
}

interface SyncResult {
  drivers: number;
  viagens: number;
  mapped: number;
  created: number;
  vehicles_mapped: number;
  vehicles_created: number;
  driver_vehicles_created: number;
  driver_vehicles_closed: number;
}

async function getBoltToken(supabase: any, integracaoId?: string): Promise<{ token: string; companyId: number; integracaoId: string }> {
  let query = supabase
    .from("plataformas_configuracao")
    .select("id, client_id, client_secret, company_id")
    .eq("ativo", true)
    .eq("plataforma", "bolt");

  if (integracaoId) {
    query = query.eq("id", integracaoId);
  }

  const { data: config, error } = await query.single();

  if (error || !config) {
    throw new Error("Configuração Bolt não encontrada");
  }

  const response = await fetch("https://oidc.bolt.eu/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      grant_type: "client_credentials",
      scope: "fleet-integration:api",
    }),
  });

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status}`);
  }

  const data = await response.json();
  return { token: data.access_token, companyId: config.company_id, integracaoId: config.id };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    requireInternalRequest(req, supabaseServiceKey);
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 401;
    return new Response(JSON.stringify({ success: false, error: 'Chamada interna não autorizada' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const { integracao_id, days_back = 1 } = body;

    console.log(`[bolt-full-sync] Iniciando sincronização completa (últimos ${days_back} dias)`);

    const { token, companyId, integracaoId } = await getBoltToken(supabase, integracao_id);

    const result: SyncResult = {
      drivers: 0,
      viagens: 0,
      mapped: 0,
      created: 0,
      vehicles_mapped: 0,
      vehicles_created: 0,
      driver_vehicles_created: 0,
      driver_vehicles_closed: 0,
    };

    // 1. Buscar e guardar drivers da API Bolt
    console.log("[bolt-full-sync] Buscando motoristas...");
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60);

    try {
      const driversResponse = await fetch(`${BOLT_API_BASE}/fleetIntegration/v1/getDrivers`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_id: companyId,
          start_ts: sevenDaysAgo,
          end_ts: now,
        }),
      });

      if (driversResponse.ok) {
        const driversData = await driversResponse.json();
        const drivers = driversData.data?.drivers || [];
        result.drivers = drivers.length;

        if (drivers.length > 0) {
          const driversToUpsert = drivers.map((driver: any) => ({
            driver_uuid: driver.driver_uuid || driver.uuid || driver.id,
            name: driver.name || driver.driver_name || `${driver.first_name || ""} ${driver.last_name || ""}`.trim() || null,
            email: driver.email || null,
            phone: driver.phone || driver.driver_phone || null,
            status: driver.status || null,
            registration_date: driver.registration_date || driver.created_at || null,
            dados_raw: driver,
            integracao_id: integracaoId,
            updated_at: new Date().toISOString(),
          }));

          await supabase
            .from('bolt_drivers')
            .upsert(driversToUpsert, { onConflict: 'driver_uuid' });

          console.log(`[bolt-full-sync] ${drivers.length} motoristas guardados`);
        }
      }
    } catch (driversError) {
      console.error("[bolt-full-sync] Erro ao buscar motoristas:", driversError);
    }

    await delay(500);

    // 2. Auto-mapear motoristas
    console.log("[bolt-full-sync] Auto-mapeando motoristas...");
    try {
      const autoMapResponse = await fetch(
        `${supabaseUrl}/functions/v1/bolt-auto-map-drivers`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ integracao_id: integracaoId }),
        }
      );

      if (autoMapResponse.ok) {
        const autoMapData = await autoMapResponse.json();
        result.mapped = autoMapData.mapped || 0;
        result.created = autoMapData.created || 0;
        console.log(`[bolt-full-sync] Auto-map: ${result.mapped} mapeados, ${result.created} criados`);
      }
    } catch (autoMapError) {
      console.error("[bolt-full-sync] Erro no auto-map:", autoMapError);
    }

    await delay(500);

    // 3. Buscar e guardar vehicles da API Bolt
    console.log("[bolt-full-sync] Buscando veículos...");
    try {
      const vehiclesResponse = await fetch(`${BOLT_API_BASE}/fleetIntegration/v1/getVehicles`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_id: companyId,
          start_ts: sevenDaysAgo,
          end_ts: now,
        }),
      });

      if (vehiclesResponse.ok) {
        const vehiclesData = await vehiclesResponse.json();
        const vehicles = vehiclesData.data?.vehicles || [];

        if (vehicles.length > 0) {
          const vehiclesToUpsert = vehicles.map((vehicle: any) => ({
            vehicle_uuid: vehicle.vehicle_uuid || vehicle.uuid || vehicle.id,
            license_plate: vehicle.reg_number || vehicle.license_plate || null,
            brand: extractBrand(vehicle.model) || vehicle.brand || null,
            model: vehicle.model || null,
            year: vehicle.year || null,
            color: vehicle.color || null,
            status: vehicle.status || null,
            dados_raw: vehicle,
            integracao_id: integracaoId,
            updated_at: new Date().toISOString(),
          }));

          await supabase
            .from('bolt_vehicles')
            .upsert(vehiclesToUpsert, { onConflict: 'vehicle_uuid' });

          console.log(`[bolt-full-sync] ${vehicles.length} veículos guardados`);
        }
      }
    } catch (vehiclesError) {
      console.error("[bolt-full-sync] Erro ao buscar veículos:", vehiclesError);
    }

    await delay(500);

    // 4. Auto-mapear veículos
    console.log("[bolt-full-sync] Auto-mapeando veículos...");
    try {
      const autoMapVehiclesResponse = await fetch(
        `${supabaseUrl}/functions/v1/bolt-auto-map-vehicles`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ integracao_id: integracaoId }),
        }
      );

      if (autoMapVehiclesResponse.ok) {
        const autoMapVehiclesData = await autoMapVehiclesResponse.json();
        result.vehicles_mapped = autoMapVehiclesData.mapped || 0;
        result.vehicles_created = autoMapVehiclesData.created || 0;
        console.log(`[bolt-full-sync] Auto-map veículos: ${result.vehicles_mapped} mapeados, ${result.vehicles_created} criados`);
      }
    } catch (autoMapVehiclesError) {
      console.error("[bolt-full-sync] Erro no auto-map veículos:", autoMapVehiclesError);
    }

    await delay(500);

    // 5. Sincronizar viagens (com paginação)
    console.log("[bolt-full-sync] Sincronizando viagens...");
    const daysBackTs = now - (days_back * 24 * 60 * 60);
    const BATCH_SIZE = 500;
    const MAX_PAGES = 40; // Safety limit: 20000 trips max

    try {
      let offset = 0;
      let hasMore = true;
      let totalViagens = 0;

      while (hasMore && offset / BATCH_SIZE < MAX_PAGES) {
        const ordersResponse = await fetch(`${BOLT_API_BASE}/fleetIntegration/v1/getFleetOrders`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            company_ids: [companyId],
            start_ts: daysBackTs,
            end_ts: now,
            limit: BATCH_SIZE,
            offset,
          }),
        });

        if (!ordersResponse.ok) {
          console.error(`[bolt-full-sync] Orders API error: ${ordersResponse.status}`);
          break;
        }

        const ordersData = await ordersResponse.json();
        const orders = ordersData.data?.orders || [];
        totalViagens += orders.length;

        if (orders.length > 0) {
          const viagensData = orders.map((order: any) => ({
            order_reference: order.order_reference,
            driver_uuid: order.driver_uuid,
            driver_name: order.driver_name,
            driver_phone: order.driver_phone || null,
            vehicle_license_plate: order.vehicle_license_plate || null,
            vehicle_model: order.vehicle_model || null,
            payment_method: order.payment_method,
            order_status: order.order_status,
            order_created_timestamp: order.order_created_timestamp 
              ? new Date(order.order_created_timestamp * 1000).toISOString() 
              : null,
            payment_confirmed_timestamp: order.payment_confirmed_timestamp 
              ? new Date(order.payment_confirmed_timestamp * 1000).toISOString() 
              : null,
            pickup_address: order.pickup_address || null,
            destination_address: order.destination_address || null,
            total_price: order.order_price?.ride_price ?? null,
            driver_earnings: order.order_price?.net_earnings ?? null,
            commission: order.order_price?.commission ?? null,
            integracao_id: integracaoId,
          }));

          await supabase
            .from("bolt_viagens")
            .upsert(viagensData, { 
              onConflict: "order_reference",
              ignoreDuplicates: false 
            });

          console.log(`[bolt-full-sync] Página ${offset / BATCH_SIZE + 1}: ${orders.length} viagens`);
        }

        hasMore = orders.length === BATCH_SIZE;
        offset += BATCH_SIZE;

        if (hasMore) await delay(300);
      }

      result.viagens = totalViagens;
      console.log(`[bolt-full-sync] Total: ${totalViagens} viagens sincronizadas`);
    } catch (ordersError) {
      console.error("[bolt-full-sync] Erro ao sincronizar viagens:", ordersError);
    }

    // 5.5 Auto-mapear motorista_id nas viagens recém-inseridas
    console.log("[bolt-full-sync] Auto-mapeando motorista_id nas viagens...");
    try {
      const { data: mappings } = await supabase
        .from("bolt_mapeamento_motoristas")
        .select("driver_uuid, motorista_id")
        .eq("integracao_id", integracaoId)
        .not("motorista_id", "is", null);

      if (mappings && mappings.length > 0) {
        for (const mapping of mappings) {
          await supabase
            .from("bolt_viagens")
            .update({ motorista_id: mapping.motorista_id })
            .eq("driver_uuid", mapping.driver_uuid)
            .eq("integracao_id", integracaoId)
            .is("motorista_id", null);
        }
        console.log(`[bolt-full-sync] ${mappings.length} mapeamentos aplicados às viagens`);
      }
    } catch (mapError) {
      console.error("[bolt-full-sync] Erro ao auto-mapear viagens:", mapError);
    }

    console.log("[bolt-full-sync] Buscando FleetStateLogs...");
    let stateLogsPairs: { driver_uuid: string; vehicle_uuid: string }[] = [];
    
    try {
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
      const stateLogsResponse = await fetch(`${BOLT_API_BASE}/fleetIntegration/v1/getFleetStateLogs`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_id: companyId,
          start_ts: thirtyDaysAgo,
          end_ts: now,
          limit: 1000,
          offset: 0,
        }),
      });

      const stateLogsData = await stateLogsResponse.json();
      console.log(`[bolt-full-sync] FleetStateLogs status: ${stateLogsResponse.status}, response: ${JSON.stringify(stateLogsData).substring(0, 500)}`);
      
      if (stateLogsResponse.ok && stateLogsData.data) {
        console.log(`[bolt-full-sync] FleetStateLogs data keys: ${JSON.stringify(Object.keys(stateLogsData.data))}`);
        
        const logs = stateLogsData.data?.logs || stateLogsData.data?.state_logs || [];
        console.log(`[bolt-full-sync] Logs count: ${logs.length}, sample: ${JSON.stringify(logs[0] || {})}`);
        
        // Extrair pares únicos driver_uuid ↔ vehicle_uuid
        const pairsMap = new Map<string, { driver_uuid: string; vehicle_uuid: string }>();
        for (const log of logs) {
          if (log.driver_uuid && log.vehicle_uuid) {
            const key = `${log.driver_uuid}-${log.vehicle_uuid}`;
            pairsMap.set(key, {
              driver_uuid: log.driver_uuid,
              vehicle_uuid: log.vehicle_uuid,
            });
          }
        }
        stateLogsPairs = Array.from(pairsMap.values());
        console.log(`[bolt-full-sync] ${stateLogsPairs.length} pares únicos driver-vehicle extraídos dos StateLogs`);
      } else if (stateLogsData.validation_errors) {
        console.error(`[bolt-full-sync] FleetStateLogs validation errors: ${JSON.stringify(stateLogsData.validation_errors)}`);
      }
    } catch (stateLogsError) {
      console.error("[bolt-full-sync] Erro ao buscar FleetStateLogs:", stateLogsError);
    }

    await delay(500);

    // 7. Auto-mapear viaturas a motoristas (usando active_vehicle + FleetStateLogs)
    console.log("[bolt-full-sync] Associando viaturas a motoristas...");
    try {
      const autoMapDriverVehiclesResponse = await fetch(
        `${supabaseUrl}/functions/v1/bolt-auto-map-driver-vehicles`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            integracao_id: integracaoId,
            state_logs_pairs: stateLogsPairs,
          }),
        }
      );

      if (autoMapDriverVehiclesResponse.ok) {
        const autoMapDriverVehiclesData = await autoMapDriverVehiclesResponse.json();
        result.driver_vehicles_created = autoMapDriverVehiclesData.created || 0;
        result.driver_vehicles_closed = autoMapDriverVehiclesData.closed || 0;
        console.log(`[bolt-full-sync] Auto-map driver-vehicles: ${result.driver_vehicles_created} criadas, ${result.driver_vehicles_closed} fechadas`);
      }
    } catch (autoMapDriverVehiclesError) {
      console.error("[bolt-full-sync] Erro no auto-map driver-vehicles:", autoMapDriverVehiclesError);
    }

    // 8. Actualizar último sync
    await supabase
      .from("plataformas_configuracao")
      .update({ ultimo_sync: new Date().toISOString() })
      .eq("id", integracaoId);

    // 9. Log de sincronização
    await supabase.from("bolt_sync_logs").insert({
      tipo: "full-sync",
      status: "success",
      mensagem: `Full sync: ${result.drivers} drivers, ${result.viagens} viagens, ${result.mapped} motoristas mapeados, ${result.created} motoristas criados, ${result.vehicles_mapped} veículos mapeados, ${result.vehicles_created} veículos criados, ${result.driver_vehicles_created} associações criadas`,
      viagens_novas: result.viagens,
      viagens_atualizadas: 0,
      integracao_id: integracaoId,
    });

    console.log(`[bolt-full-sync] Concluído: ${JSON.stringify(result)}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        ...result,
        message: `Sincronização completa: ${result.drivers} motoristas, ${result.viagens} viagens, ${result.created} novos motoristas, ${result.vehicles_created} novas viaturas, ${result.driver_vehicles_created} associações`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const message = (error as Error)?.message || "Erro inesperado";
    console.error("[bolt-full-sync] Error:", message);

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
