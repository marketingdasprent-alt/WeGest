import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutoMapResult {
  success: boolean;
  associations_created: number;
  associations_closed: number;
  associations_skipped: number;
  motoristas_created: number;
  motoristas_mapped: number;
  viaturas_created: number;
  viaturas_mapped: number;
  unmapped_drivers: number;
  errors: string[];
}

interface ActiveVehicle {
  uuid?: string;
  reg_number?: string;
  model?: string;
  color?: string;
  state?: string;
}

// ── Utility functions (copied from bolt-auto-map-vehicles) ──

function formatPlate(plate: string): string {
  const cleaned = plate.toUpperCase().replace(/[\s\-\.]/g, '').trim();
  if (cleaned.length === 6) {
    return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 4)}-${cleaned.slice(4, 6)}`;
  }
  return plate;
}

function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[\s\-\.]/g, '').trim();
}

function extractBrandAndModel(modelString: string | null): { marca: string; modelo: string } {
  if (!modelString) return { marca: "Desconhecida", modelo: "Desconhecido" };
  const parts = modelString.trim().split(' ');
  if (parts.length >= 2) {
    return { marca: parts[0], modelo: parts.slice(1).join(' ') };
  }
  return { marca: parts[0], modelo: parts[0] };
}

function translateColor(color: string | null): string | null {
  if (!color) return null;
  const translations: Record<string, string> = {
    'black': 'Preto', 'white': 'Branco', 'gray': 'Cinza', 'grey': 'Cinza',
    'silver': 'Prata', 'red': 'Vermelho', 'blue': 'Azul', 'green': 'Verde',
    'yellow': 'Amarelo', 'orange': 'Laranja', 'brown': 'Castanho', 'beige': 'Bege',
    'gold': 'Dourado', 'purple': 'Roxo', 'pink': 'Rosa',
  };
  return translations[color.toLowerCase()] || color;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\+]/g, '').slice(-9);
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

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const { integracao_id } = body as { integracao_id?: string };

    console.log(`[bolt-auto-map-driver-vehicles] Iniciando mapeamento auto-suficiente${integracao_id ? ` para integração ${integracao_id}` : ''}`);

    // Obter org_id da integração para filtrar por org. Ao contrário de
    // bolt-auto-map-vehicles, esta função pré-carrega motoristas/viaturas/
    // associações UMA VEZ em mapas partilhados por todo o pedido — por
    // isso, ao contrário do outro ficheiro, aqui exige-se sempre um
    // integracao_id/org_id resolúvel, em vez de degradar para uma corrida
    // sem filtro de org (todos os chamadores atuais, ex. bolt-full-sync,
    // já passam sempre integracao_id).
    if (!integracao_id) {
      return new Response(
        JSON.stringify({ success: false, error: "integracao_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: integConfig } = await supabase
      .from("plataformas_configuracao")
      .select("org_id")
      .eq("id", integracao_id)
      .single();
    const orgId: string | null = integConfig?.org_id || null;
    if (!orgId) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração Bolt não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result: AutoMapResult = {
      success: true,
      associations_created: 0,
      associations_closed: 0,
      associations_skipped: 0,
      motoristas_created: 0,
      motoristas_mapped: 0,
      viaturas_created: 0,
      viaturas_mapped: 0,
      unmapped_drivers: 0,
      errors: [],
    };

    // ── 1. Fetch all bolt_drivers with active_vehicle ──
    let driversQuery = supabase
      .from("bolt_drivers")
      .select("id, driver_uuid, motorista_id, dados_raw, name, email, phone");

    if (integracao_id) {
      driversQuery = driversQuery.eq("integracao_id", integracao_id);
    }

    const { data: boltDrivers, error: driversError } = await driversQuery;
    if (driversError) throw new Error(`Erro ao buscar bolt_drivers: ${driversError.message}`);

    // Filter to only drivers with active_vehicle
    const driversWithVehicle = (boltDrivers || []).filter((d: any) => {
      const raw = d.dados_raw as Record<string, unknown> | null;
      const av = raw?.active_vehicle as ActiveVehicle | null;
      return av?.reg_number;
    });

    console.log(`[bolt-auto-map-driver-vehicles] ${boltDrivers?.length || 0} total drivers, ${driversWithVehicle.length} com active_vehicle`);

    if (driversWithVehicle.length === 0) {
      return new Response(
        JSON.stringify({ ...result, message: "Nenhum driver com active_vehicle encontrado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Pre-load all motoristas for matching (filtrar por org) ──
    const { data: allMotoristas, error: motoristasError } = await supabase
      .from("motoristas_ativos")
      .select("id, nome, email, telefone")
      .eq("org_id", orgId);
    if (motoristasError) throw new Error(`Erro ao buscar motoristas: ${motoristasError.message}`);

    const motoristasByEmail = new Map<string, string>();
    const motoristasByPhone = new Map<string, string>();
    const motoristasByName = new Map<string, string>();
    const motoristasByFirstLast = new Map<string, string>();
    for (const m of allMotoristas || []) {
      if (m.email) motoristasByEmail.set(m.email.toLowerCase().trim(), m.id);
      if (m.telefone) motoristasByPhone.set(normalizePhone(m.telefone), m.id);
      if (m.nome) {
        motoristasByName.set(m.nome.toLowerCase().trim(), m.id);
        const fl = normalizeFirstLast(m.nome);
        if (fl.includes(" ")) motoristasByFirstLast.set(fl, m.id);
      }
    }

    // ── 3. Pre-load all viaturas for matching (filtrar por org) ──
    const { data: allViaturas, error: viaturasError } = await supabase
      .from("viaturas")
      .select("id, matricula")
      .eq("org_id", orgId);
    if (viaturasError) throw new Error(`Erro ao buscar viaturas: ${viaturasError.message}`);

    const viaturasByPlate = new Map<string, string>();
    for (const v of allViaturas || []) {
      if (v.matricula) viaturasByPlate.set(normalizePlate(v.matricula), v.id);
    }

    // ── 4. Pre-load existing active associations (filtrar por org) ──
    const { data: existingAssociations, error: assocError } = await supabase
      .from("motorista_viaturas")
      .select("id, motorista_id, viatura_id")
      .is("data_fim", null)
      .eq("org_id", orgId);
    if (assocError) throw new Error(`Erro ao buscar associações: ${assocError.message}`);

    const activeAssocByMotorista = new Map<string, { id: string; viatura_id: string }>();
    for (const a of existingAssociations || []) {
      activeAssocByMotorista.set(a.motorista_id, { id: a.id, viatura_id: a.viatura_id });
    }

    // ── 5. Process each driver with active_vehicle ──
    const today = new Date().toISOString().split('T')[0];
    const viaturasToMarkEmUso = new Set<string>();

    for (const driver of driversWithVehicle) {
      try {
        const raw = driver.dados_raw as Record<string, unknown>;
        const activeVehicle = raw.active_vehicle as ActiveVehicle;
        const plate = activeVehicle.reg_number!;
        const normalizedPlate = normalizePlate(plate);
        const formattedPlate = formatPlate(plate);

        const driverName = driver.name ||
          `${(raw.first_name as string) || ''} ${(raw.last_name as string) || ''}`.trim() ||
          'Sem nome';

        // ── 5a. Ensure motorista exists ──
        let motoristaId = driver.motorista_id;

        if (!motoristaId) {
          // Cascade: email → phone → name → create
          const email = driver.email?.toLowerCase().trim();
          const phone = driver.phone ? normalizePhone(driver.phone) : null;
          const nameLower = driverName.toLowerCase().trim();

          if (email && motoristasByEmail.has(email)) {
            motoristaId = motoristasByEmail.get(email)!;
            result.motoristas_mapped++;
            console.log(`[bolt-auto-map-driver-vehicles] Driver ${driverName} mapeado por email → ${motoristaId}`);
          } else if (phone && motoristasByPhone.has(phone)) {
            motoristaId = motoristasByPhone.get(phone)!;
            result.motoristas_mapped++;
            console.log(`[bolt-auto-map-driver-vehicles] Driver ${driverName} mapeado por telefone → ${motoristaId}`);
          } else if (nameLower !== 'sem nome' && motoristasByName.has(nameLower)) {
            motoristaId = motoristasByName.get(nameLower)!;
            result.motoristas_mapped++;
            console.log(`[bolt-auto-map-driver-vehicles] Driver ${driverName} mapeado por nome → ${motoristaId}`);
          } else {
            // 4th fallback: first+last normalized name matching
            const driverFL = normalizeFirstLast(driverName);
            if (driverFL.includes(" ") && motoristasByFirstLast.has(driverFL)) {
              motoristaId = motoristasByFirstLast.get(driverFL)!;
              result.motoristas_mapped++;
              console.log(`[bolt-auto-map-driver-vehicles] Driver ${driverName} mapeado por first+last → ${motoristaId}`);
            } else {
            // Create new motorista
            const nome = driverName !== 'Sem nome' ? driverName : (email || 'Motorista Bolt');
            const { data: newMotorista, error: insertError } = await supabase
              .from("motoristas_ativos")
              .insert({
                nome,
                email: driver.email || null,
                telefone: driver.phone || null,
                status_ativo: true,
                org_id: orgId,
                observacoes: "Criado automaticamente via sincronização Bolt (driver-vehicles)",
              })
              .select("id")
              .single();

            if (insertError) {
              result.errors.push(`Erro ao criar motorista ${driverName}: ${insertError.message}`);
              console.error(`[bolt-auto-map-driver-vehicles] Erro ao criar motorista:`, insertError);
              continue;
            }

            motoristaId = newMotorista.id;
            result.motoristas_created++;
            // Add to local maps
            if (driver.email) motoristasByEmail.set(driver.email.toLowerCase().trim(), motoristaId);
            if (driver.phone) motoristasByPhone.set(normalizePhone(driver.phone), motoristaId);
            motoristasByName.set(nome.toLowerCase().trim(), motoristaId);
            console.log(`[bolt-auto-map-driver-vehicles] Novo motorista criado: ${nome} → ${motoristaId}`);
          }
          }

          // Update bolt_drivers with motorista_id
          await supabase
            .from("bolt_drivers")
            .update({ motorista_id: motoristaId })
            .eq("id", driver.id);
        }

        // ── 5b. Ensure viatura exists ──
        let viaturaId = viaturasByPlate.get(normalizedPlate);

        if (!viaturaId) {
          // Create viatura
          const { marca, modelo } = extractBrandAndModel(activeVehicle.model || null);
          const cor = translateColor(activeVehicle.color || null);

          const { data: newViatura, error: insertError } = await supabase
            .from("viaturas")
            .insert({
              matricula: formattedPlate,
              marca,
              modelo,
              cor,
              org_id: orgId,
              observacoes: "Criada automaticamente via sincronização Bolt (driver-vehicles)",
            })
            .select("id")
            .single();

          if (insertError) {
            result.errors.push(`Erro ao criar viatura ${formattedPlate}: ${insertError.message}`);
            console.error(`[bolt-auto-map-driver-vehicles] Erro ao criar viatura:`, insertError);
            continue;
          }

          viaturaId = newViatura.id;
          viaturasByPlate.set(normalizedPlate, viaturaId);
          result.viaturas_created++;
          console.log(`[bolt-auto-map-driver-vehicles] Nova viatura criada: ${formattedPlate} (${marca} ${modelo}) → ${viaturaId}`);
        } else {
          result.viaturas_mapped++;
        }

        // ── 5c. Ensure association exists ──
        const existingAssoc = activeAssocByMotorista.get(motoristaId);

        if (existingAssoc) {
          if (existingAssoc.viatura_id === viaturaId) {
            // Already correct
            viaturasToMarkEmUso.add(viaturaId);
            result.associations_skipped++;
            continue;
          }

          // Driver changed vehicle — close old association
          const { error: closeError } = await supabase
            .from("motorista_viaturas")
            .update({
              data_fim: today,
              observacoes: 'Fechado automaticamente - motorista mudou de viatura (Bolt sync via active_vehicle)',
            })
            .eq("id", existingAssoc.id);

          if (closeError) {
            result.errors.push(`Erro ao fechar associação ${existingAssoc.id}: ${closeError.message}`);
            continue;
          }

          // Check if old viatura still has other active associations
          const { data: otherAssoc } = await supabase
            .from("motorista_viaturas")
            .select("id")
            .eq("viatura_id", existingAssoc.viatura_id)
            .is("data_fim", null)
            .neq("id", existingAssoc.id)
            .limit(1);

          if (!otherAssoc || otherAssoc.length === 0) {
            await supabase
              .from("viaturas")
              .update({ status: "disponivel" })
              .eq("id", existingAssoc.viatura_id);
          }

          result.associations_closed++;
        }

        // Create new association
        const { error: insertError } = await supabase
          .from("motorista_viaturas")
          .insert({
            motorista_id: motoristaId,
            viatura_id: viaturaId,
            data_inicio: today,
            status: "ativo",
            org_id: orgId,
            observacoes: "Criado automaticamente via sincronização Bolt (active_vehicle)",
          });

        if (insertError) {
          if (insertError.code === '23505') {
            result.associations_skipped++;
          } else {
            result.errors.push(`Erro ao criar associação ${driverName} → ${formattedPlate}: ${insertError.message}`);
          }
          continue;
        }

        viaturasToMarkEmUso.add(viaturaId);
        activeAssocByMotorista.set(motoristaId, { id: 'new', viatura_id: viaturaId });
        result.associations_created++;
        console.log(`[bolt-auto-map-driver-vehicles] Associação criada: ${driverName} → ${formattedPlate}`);

      } catch (pairError) {
        const errorMsg = `Erro ao processar driver ${driver.driver_uuid}: ${(pairError as Error).message}`;
        result.errors.push(errorMsg);
        console.error(`[bolt-auto-map-driver-vehicles]`, errorMsg);
      }
    }

    // ── 6. Update all associated viaturas to 'em_uso' ──
    if (viaturasToMarkEmUso.size > 0) {
      const { error: updateError } = await supabase
        .from("viaturas")
        .update({ status: "em_uso" })
        .in("id", Array.from(viaturasToMarkEmUso));

      if (updateError) {
        console.error("[bolt-auto-map-driver-vehicles] Erro ao actualizar status:", updateError);
      } else {
        console.log(`[bolt-auto-map-driver-vehicles] ${viaturasToMarkEmUso.size} viaturas marcadas como 'em_uso'`);
      }
    }

    const summary = `Associações: ${result.associations_created} criadas, ${result.associations_closed} fechadas, ${result.associations_skipped} iguais. Motoristas: ${result.motoristas_created} criados, ${result.motoristas_mapped} mapeados. Viaturas: ${result.viaturas_created} criadas, ${result.viaturas_mapped} existentes.`;
    console.log(`[bolt-auto-map-driver-vehicles] Concluído: ${summary}`);

    return new Response(
      JSON.stringify({ ...result, message: summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const message = (error as Error)?.message || "Erro inesperado";
    console.error("[bolt-auto-map-driver-vehicles] Error:", message);

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
