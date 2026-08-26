import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BoltDriver {
  id: string;
  driver_uuid: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  dados_raw: {
    first_name?: string;
    last_name?: string;
  } | null;
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
  created: number;
  skipped: number;
  errors: string[];
  details: {
    driver_uuid: string;
    driver_name: string;
    action: "mapped" | "created" | "skipped";
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

    console.log(`[bolt-auto-map-drivers] Iniciando auto-mapeamento para integração: ${integracao_id}`);

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

    // 1. Buscar todos os bolt_drivers sem mapeamento para esta integração
    const { data: unmappedDrivers, error: driversError } = await supabase
      .from("bolt_drivers")
      .select("*")
      .eq("integracao_id", integracao_id)
      .is("motorista_id", null);

    if (driversError) {
      console.error("[bolt-auto-map-drivers] Erro ao buscar drivers:", driversError);
      throw driversError;
    }

    console.log(`[bolt-auto-map-drivers] Encontrados ${unmappedDrivers?.length || 0} drivers não mapeados`);

    const result: AutoMapResult = {
      success: true,
      mapped: 0,
      created: 0,
      skipped: 0,
      errors: [],
      details: [],
    };

    if (!unmappedDrivers || unmappedDrivers.length === 0) {
      return new Response(
        JSON.stringify({ ...result, message: "Nenhum motorista Bolt para mapear" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Processar cada driver
    for (const driver of unmappedDrivers as BoltDriver[]) {
      const email = driver.email?.toLowerCase().trim();
      const driverName = driver.name || 
        `${driver.dados_raw?.first_name || ""} ${driver.dados_raw?.last_name || ""}`.trim() ||
        "Sem nome";

      const phone = driver.phone?.trim();

      // Se não tem email nem telefone, pular
      if (!email && !phone) {
        result.skipped++;
        result.details.push({
          driver_uuid: driver.driver_uuid,
          driver_name: driverName,
          action: "skipped",
          reason: "Sem email nem telefone",
        });
        console.log(`[bolt-auto-map-drivers] Driver ${driver.driver_uuid} pulado - sem email nem telefone`);
        continue;
      }

      try {
        // 3. Procurar motorista existente por email, telefone ou nome
        let existingMotorista: { id: string; nome: string } | null = null;
        let searchError: any = null;

        // 3a. Tentar por email primeiro (filtrar por org)
        if (email) {
          const { data, error } = await supabase
            .from("motoristas_ativos")
            .select("id, nome")
            .eq("org_id", orgId)
            .ilike("email", email)
            .maybeSingle();
          existingMotorista = data;
          searchError = error;
        }

        // 3b. Se não encontrou por email, tentar por telefone (filtrar por org)
        if (!existingMotorista && !searchError && phone) {
          // Normalizar telefone para comparação (remover espaços e prefixos)
          const phoneNormalized = phone.replace(/\s+/g, '').replace('+351', '');
          const { data, error } = await supabase
            .from("motoristas_ativos")
            .select("id, nome, telefone")
            .eq("org_id", orgId)
            .not("telefone", "is", null);
          
          if (!error && data) {
            // Primeiro procurar por telefone + nome similar (casos de telefones partilhados)
            const driverFL = normalizeFirstLast(driverName);
            const matches = data.filter((m: any) => {
              const mPhone = (m.telefone || '').replace(/\s+/g, '').replace('+351', '');
              return mPhone === phoneNormalized;
            });

            if (matches.length === 1) {
              existingMotorista = matches[0];
            } else if (matches.length > 1) {
              // Se há múltiplos com o mesmo telefone, desampatar pelo nome
              existingMotorista = matches.find((m: any) => normalizeFirstLast(m.nome) === driverFL) || null;
            }
          }
          searchError = error;
        }


        // 3c. Se não encontrou por telefone, tentar por nome exacto (filtrar por org)
        if (!existingMotorista && !searchError && driverName !== "Sem nome") {
          const { data, error } = await supabase
            .from("motoristas_ativos")
            .select("id, nome")
            .eq("org_id", orgId)
            .ilike("nome", driverName)
            .maybeSingle();
          existingMotorista = data;
          searchError = error;
        }

        // 3d. Se não encontrou por nome exacto, tentar por first+last normalizado (filtrar por org)
        if (!existingMotorista && !searchError && driverName !== "Sem nome") {
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
            if (allErr) searchError = allErr;
          }
        }

        if (searchError) {
          console.error(`[bolt-auto-map-drivers] Erro ao buscar motorista por email:`, searchError);
          result.errors.push(`Erro ao buscar ${email}: ${searchError.message}`);
          continue;
        }

        let motoristaId: string;
        let actionTaken: "mapped" | "created";

        if (existingMotorista) {
          // 4a. Motorista existe - usar ID existente
          motoristaId = existingMotorista.id;
          actionTaken = "mapped";
          console.log(`[bolt-auto-map-drivers] Match encontrado: ${email} → ${existingMotorista.nome}`);
        } else {
          // 4b. Motorista não existe - criar novo
          const nome = driverName !== "Sem nome" ? driverName : email;
          
          const { data: newMotorista, error: insertError } = await supabase
            .from("motoristas_ativos")
            .insert({
              nome: nome,
              email: email,
              telefone: driver.phone || null,
              status_ativo: true,
              org_id: orgId,
              observacoes: "Criado automaticamente via sincronização Bolt",
            })
            .select("id")
            .single();

          if (insertError) {
            console.error(`[bolt-auto-map-drivers] Erro ao criar motorista:`, insertError);
            result.errors.push(`Erro ao criar motorista ${email}: ${insertError.message}`);
            continue;
          }

          motoristaId = newMotorista.id;
          actionTaken = "created";
          result.created++;
          console.log(`[bolt-auto-map-drivers] Novo motorista criado: ${nome} (${email})`);
        }

        // Auto-save bolt_id to motoristas_ativos if not present
        const { error: updateMotError } = await supabase
          .from("motoristas_ativos")
          .update({ bolt_id: driver.driver_uuid })
          .eq("id", motoristaId)
          .is("bolt_id", null);

        if (updateMotError) {
          console.warn(`[bolt-auto-map-drivers] Falha ao auto-gravar bolt_id para ${driverName}:`, updateMotError.message);
        } else {
          console.log(`[bolt-auto-map-drivers] Bolt ID auto-gravado para ${driverName}`);
        }

        // 5. Actualizar bolt_drivers com o motorista_id
        const { error: updateDriverError } = await supabase
          .from("bolt_drivers")
          .update({ motorista_id: motoristaId })
          .eq("id", driver.id);

        if (updateDriverError) {
          console.error(`[bolt-auto-map-drivers] Erro ao actualizar bolt_drivers:`, updateDriverError);
          result.errors.push(`Erro ao actualizar driver ${driver.driver_uuid}: ${updateDriverError.message}`);
          continue;
        }

        // 6. Criar/actualizar bolt_mapeamento_motoristas
        const { error: upsertError } = await supabase
          .from("bolt_mapeamento_motoristas")
          .upsert(
            {
              driver_uuid: driver.driver_uuid,
              driver_name: driverName,
              driver_phone: driver.phone,
              motorista_id: motoristaId,
              integracao_id: integracao_id,
              // Explícito: sem isto a coluna cai no default get_current_org_id(),
              // que numa edge function a correr com service role não resolve para
              // nada. O trigger fn_mapeamento_mesma_org recusaria a linha por
              // apontar para um motorista de org diferente (null vs orgId), e
              // como este upsert é tratado como não-crítico, a fonte de verdade
              // do sync deixava de ser mantida sem ninguém dar por isso.
              org_id: orgId,
              auto_mapped: true,
            },
            { onConflict: "driver_uuid,integracao_id" }
          );

        if (upsertError) {
          console.error(`[bolt-auto-map-drivers] Erro ao upsert mapeamento:`, upsertError);
          // Não é crítico, continuar
        }

        result.mapped++;
        result.details.push({
          driver_uuid: driver.driver_uuid,
          driver_name: driverName,
          action: actionTaken,
          motorista_id: motoristaId,
        });

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Erro processando ${driver.driver_uuid}: ${errorMsg}`);
        console.error(`[bolt-auto-map-drivers] Erro:`, err);
      }
    }

    const message = `Auto-mapeamento concluído: ${result.mapped} mapeados (${result.created} novos criados), ${result.skipped} pulados`;
    console.log(`[bolt-auto-map-drivers] ${message}`);

    return new Response(
      JSON.stringify({ ...result, message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[bolt-auto-map-drivers] Erro geral:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Erro desconhecido" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
