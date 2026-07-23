import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCargoPermissoes } from "../_shared/register-org/buildCargoPermissoes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESERVED_CODIGOS = new Set([
  "www", "api", "app", "admin", "mail", "ftp", "smtp", "pop", "imap",
  "ns1", "ns2", "staging", "dev", "test", "cdn", "static", "assets",
  "decada", "distancia", "wegest", "suporte", "help", "login", "register",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const {
      nome_empresa,
      codigo,
      nif,
      morada,
      telefone,
      admin_nome,
      admin_email,
      admin_password,
    } = await req.json();

    // ========== VALIDAÇÕES ==========
    if (!nome_empresa || !codigo || !nif || !admin_nome || !admin_email || !admin_password) {
      return jsonResponse({ error: "Todos os campos obrigatórios devem ser preenchidos." }, 400);
    }

    const codigoLower = codigo.trim().toLowerCase();

    // Validar formato do codigo (será o subdomínio)
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(codigoLower)) {
      return jsonResponse({ error: "Código inválido. Use apenas letras minúsculas, números e hífens." }, 400);
    }

    if (codigoLower.length < 3 || codigoLower.length > 63) {
      return jsonResponse({ error: "Código deve ter entre 3 e 63 caracteres." }, 400);
    }

    if (RESERVED_CODIGOS.has(codigoLower)) {
      return jsonResponse({ error: "Este código não está disponível. Escolha outro." }, 400);
    }

    if (admin_password.length < 6) {
      return jsonResponse({ error: "A password deve ter pelo menos 6 caracteres." }, 400);
    }

    // Verificar se o código já existe
    const { data: existingOrg } = await supabase
      .from("organizacoes")
      .select("id")
      .eq("codigo", codigoLower)
      .single();

    if (existingOrg) {
      return jsonResponse({ error: "Este código já está em uso. Escolha outro." }, 400);
    }

    // Verificar se o NOME da empresa já existe (case-insensitive).
    // Escapa % e _ para não serem tratados como wildcards do ilike.
    const nomeNormalizado = nome_empresa.trim();
    const nomeLikePattern = nomeNormalizado.replace(/[%_\\]/g, "\\$&");
    const { data: nomeRows } = await supabase
      .from("organizacoes")
      .select("id")
      .ilike("nome", nomeLikePattern)
      .limit(1);
    if (nomeRows && nomeRows.length > 0) {
      return jsonResponse({ error: "Já existe uma organização com este nome." }, 400);
    }

    // Verificar se o NIF já existe.
    const nifNormalizado = nif.trim();
    if (nifNormalizado) {
      const { data: nifRows } = await supabase
        .from("organizacoes")
        .select("id")
        .eq("nif", nifNormalizado)
        .limit(1);
      if (nifRows && nifRows.length > 0) {
        return jsonResponse({ error: "Já existe uma organização com este NIF." }, 400);
      }
    }

    // Verificar se o email já existe
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some(
      (u) => u.email?.toLowerCase() === admin_email.toLowerCase()
    );
    if (emailExists) {
      return jsonResponse({ error: "Este email já está registado no sistema." }, 400);
    }

    // ========== CRIAR ORGANIZAÇÃO ==========
    const { data: org, error: orgError } = await supabase
      .from("organizacoes")
      .insert({
        nome: nome_empresa.trim(),
        codigo: codigoLower,
        nif: nif.trim(),
        morada: morada?.trim() || null,
        telefone: telefone?.trim() || null,
        ativa: true,
      })
      .select("id, codigo")
      .single();

    if (orgError) {
      console.error("[register-org] Erro ao criar org:", orgError);
      return jsonResponse({ error: "Erro ao criar organização: " + orgError.message }, 500);
    }

    console.log(`[register-org] Org criada: ${org.id} (${org.codigo})`);

    // ========== CRIAR USER ADMIN ==========
    // O trigger handle_new_user_org vai tentar associar via convite.
    // Como não há convite, vai usar a primeira org ativa.
    // Vamos fazer override manual depois.
    const { data: newUser, error: userError } = await supabase.auth.admin.createUser({
      email: admin_email.trim(),
      password: admin_password,
      email_confirm: true,
      user_metadata: {
        nome: admin_nome.trim(),
        tipo_utilizador: "colaborador",
      },
    });

    if (userError) {
      console.error("[register-org] Erro ao criar user:", userError);
      // Rollback: apagar a org criada
      await supabase.from("organizacoes").delete().eq("id", org.id);
      return jsonResponse({ error: "Erro ao criar utilizador: " + userError.message }, 500);
    }

    const userId = newUser.user.id;
    console.log(`[register-org] User criado: ${userId}`);

    // ========== CONFIGURAR CARGO ADMIN ==========
    // O trigger ensure_base_cargos já criou os cargos base ("Administrador",
    // "Gestor TVDE", "Supervisor de Gestor TVDE") ao inserir a org.
    // Reutilizamos o "Administrador" existente — evita duplicar o cargo.
    let { data: cargo, error: cargoError } = await supabase
      .from("cargos")
      .select("id")
      .eq("org_id", org.id)
      .ilike("nome", "administrador")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    // Fallback defensivo: se o trigger não correr, cria o cargo.
    if (!cargo?.id) {
      const ins = await supabase
        .from("cargos")
        .insert({ nome: "Administrador", org_id: org.id })
        .select("id")
        .single();
      cargo = ins.data;
      cargoError = ins.error;
    }

    if (cargoError || !cargo?.id) {
      console.error("[register-org] Erro ao obter cargo admin:", cargoError);
      return jsonResponse({ error: "Erro ao criar cargo de administrador" }, 500);
    }

    console.log(`[register-org] Cargo criado: ${cargo.id}`);

    // ========== ASSOCIAR USER À ORG (override do trigger) ==========
    // Atualizar profile com a org correta e cargo admin
    const { error: profileError, data: profileData } = await supabase
      .from("profiles")
      .update({
        org_id: org.id,
        cargo_id: cargo.id,
        cargo: "Administrador",
        is_admin: true,
      })
      .eq("id", userId)
      .select("id, cargo_id");

    if (profileError) {
      console.error("[register-org] Erro ao atualizar profile:", profileError);
      return jsonResponse({ error: "Erro ao configurar perfil do admin: " + profileError.message }, 500);
    }

    // Validar que o cargo foi realmente atribuído
    if (!profileData || profileData.length === 0 || profileData[0].cargo_id !== cargo.id) {
      console.error("[register-org] Profile atualizado mas cargo_id não foi definido corretamente");
      // Tentar novamente com service role
      const { error: retryError } = await supabase
        .from("profiles")
        .update({ cargo_id: cargo.id })
        .eq("id", userId);

      if (retryError) {
        console.error("[register-org] Retry falhou:", retryError);
        return jsonResponse({ error: "Erro ao definir cargo do admin (retry falhou)" }, 500);
      }
    }

    console.log(`[register-org] Profile atualizado: ${userId} com cargo_id: ${cargo.id}`);

    // Garantir associação user ↔ org como owner
    const { error: userOrgError } = await supabase
      .from("user_organizacoes")
      .upsert(
        { user_id: userId, org_id: org.id, role: "owner", cargo_id: cargo.id, is_admin: true },
        { onConflict: "user_id,org_id" }
      );

    if (userOrgError) {
      console.error("[register-org] Erro ao associar user à org:", userOrgError);
    }

    // Remover associações incorretas que o trigger possa ter criado
    await supabase
      .from("user_organizacoes")
      .delete()
      .eq("user_id", userId)
      .neq("org_id", org.id);

    // Definir org ativa
    const { error: orgAtivaError } = await supabase
      .from("user_org_ativa")
      .upsert(
        { user_id: userId, org_id: org.id },
        { onConflict: "user_id" }
      );

    if (orgAtivaError) {
      console.error("[register-org] Erro ao definir org ativa:", orgAtivaError);
    }

    // ========== ATRIBUIR TODAS AS PERMISSÕES AO ADMIN ==========
    const { data: recursos, error: recursosError } = await supabase
      .from("recursos")
      .select("id");

    if (recursosError) {
      console.error("[register-org] Erro ao carregar recursos:", recursosError);
      return jsonResponse({ error: "Erro ao carregar recursos" }, 500);
    }

    if (recursos && recursos.length > 0) {
      const permissoes = buildCargoPermissoes(cargo.id, org.id, recursos);

      const { error: permissoesError } = await supabase
        .from("cargo_permissoes")
        .upsert(permissoes, { onConflict: "cargo_id,recurso_id" });

      if (permissoesError) {
        console.error("[register-org] Erro ao atribuir permissões:", permissoesError);
        return jsonResponse({ error: "Erro ao atribuir permissões: " + permissoesError.message }, 500);
      }

      console.log(`[register-org] ${recursos.length} permissões atribuídas ao cargo admin`);
    }

    console.log(`[register-org] Setup completo para org ${org.codigo} com admin ${admin_email}`);

    return jsonResponse({
      success: true,
      org: {
        id: org.id,
        codigo: org.codigo,
        subdomain: `${org.codigo}.wegest.pt`,
      },
      user: {
        id: userId,
        email: admin_email,
      },
    });

  } catch (error) {
    console.error("[register-org] Erro inesperado:", error);
    return jsonResponse({ error: "Erro interno do servidor." }, 500);
  }
});

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
