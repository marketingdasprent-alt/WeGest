import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // Criar cargo "Administrador" para a nova org
    const { data: cargo, error: cargoError } = await supabase
      .from("cargos")
      .insert({
        nome: "Administrador",
        org_id: org.id,
      })
      .select("id")
      .single();

    if (cargoError) {
      console.error("[register-org] Erro ao criar cargo:", cargoError);
    }

    // ========== ASSOCIAR USER À ORG (override do trigger) ==========
    // Atualizar profile com a org correta e cargo admin
    await supabase
      .from("profiles")
      .update({
        org_id: org.id,
        cargo_id: cargo?.id || null,
        cargo: "Administrador",
        is_admin: true,
      })
      .eq("id", userId);

    // Garantir associação user ↔ org como owner
    await supabase
      .from("user_organizacoes")
      .upsert(
        { user_id: userId, org_id: org.id, role: "owner" },
        { onConflict: "user_id,org_id" }
      );

    // Remover associações incorretas que o trigger possa ter criado
    await supabase
      .from("user_organizacoes")
      .delete()
      .eq("user_id", userId)
      .neq("org_id", org.id);

    // Definir org ativa
    await supabase
      .from("user_org_ativa")
      .upsert(
        { user_id: userId, org_id: org.id },
        { onConflict: "user_id" }
      );

    // ========== ATRIBUIR TODAS AS PERMISSÕES AO ADMIN ==========
    if (cargo?.id) {
      const { data: recursos } = await supabase
        .from("recursos")
        .select("id");

      if (recursos && recursos.length > 0) {
        const permissoes = recursos.map((r) => ({
          cargo_id: cargo.id,
          recurso_id: r.id,
        }));

        await supabase.from("cargo_permissoes").insert(permissoes);
      }
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
