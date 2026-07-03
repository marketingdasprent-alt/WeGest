import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header is required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente admin para operações privilegiadas
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Cliente do utilizador para verificar permissões
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verificar se o utilizador actual é admin
    const { data: { user: currentUser }, error: userError } = await supabaseUser.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !currentUser) {
      return new Response(
        JSON.stringify({ error: "Utilizador não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obter dados do body
    const { nome, email, password, cargo_id, org_id } = await req.json();

    // A org-alvo é obrigatória (org ativa do caller).
    const targetOrgId = org_id;
    if (!targetOrgId) {
      return new Response(
        JSON.stringify({ error: "org_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar que o caller é admin DESTA org (papel per-org em user_organizacoes).
    const { data: callerMembership, error: callerError } = await supabaseAdmin
      .from("user_organizacoes")
      .select("is_admin")
      .eq("user_id", currentUser.id)
      .eq("org_id", targetOrgId)
      .single();

    if (callerError || !callerMembership?.is_admin) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem criar utilizadores" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validações
    if (!nome || !email || !password) {
      return new Response(
        JSON.stringify({ error: "Nome, email e password são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "A password deve ter pelo menos 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar nome do cargo se fornecido
    let cargoNome = null;
    let isCargoAdmin = false;
    if (cargo_id) {
      const { data: cargo } = await supabaseAdmin
        .from("cargos")
        .select("nome")
        .eq("id", cargo_id)
        .single();
      cargoNome = cargo?.nome || null;
      // Detectar se o cargo é de administrador
      isCargoAdmin = cargoNome?.toLowerCase().includes('admin') || false;
    }

    // Criar utilizador com API Admin
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { 
        nome: nome,
        cargo_id: cargo_id,
        cargo_nome: cargoNome
      }
    });

    if (createError) {
      // Email já existe → adicionar à org em vez de criar novo utilizador
      const alreadyExists =
        createError.message.includes("already been registered") ||
        createError.message.includes("already registered");

      if (!alreadyExists) {
        console.error("Erro ao criar utilizador:", createError);
        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Encontrar user existente pelo email (profiles.id = auth.users.id)
      const { data: existingProfile, error: lookupError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .single();

      if (lookupError || !existingProfile) {
        return new Response(
          JSON.stringify({ error: "Utilizador já existe mas não foi encontrado no sistema." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const existingUserId = existingProfile.id;

      // Upsert membership na org com cargo + is_admin
      await supabaseAdmin.from("user_organizacoes").upsert({
        user_id: existingUserId,
        org_id: targetOrgId,
        role: "member",
        cargo_id: cargo_id || null,
        is_admin: isCargoAdmin,
      }, { onConflict: "user_id,org_id" });

      // Org ativa apenas se ainda não tiver
      await supabaseAdmin.from("user_org_ativa").upsert({
        user_id: existingUserId,
        org_id: targetOrgId,
      }, { onConflict: "user_id" });

      return new Response(
        JSON.stringify({
          success: true,
          existing: true,
          user: { id: existingUserId, email },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Actualizar o profile com os dados adicionais + org_id + is_admin
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        nome: nome,
        cargo_id: cargo_id,
        cargo: cargoNome,
        org_id: targetOrgId,
        is_admin: isCargoAdmin
      })
      .eq("id", newUser.user.id);

    if (updateError) {
      console.error("Erro ao actualizar profile:", updateError);
    }

    // Associar o novo user à org com cargo + is_admin
    const { error: orgError } = await supabaseAdmin
      .from("user_organizacoes")
      .insert({
        user_id: newUser.user.id,
        org_id: targetOrgId,
        role: "member",
        cargo_id: cargo_id || null,
        is_admin: isCargoAdmin,
      });

    if (orgError) {
      console.error("Erro ao associar user à org:", orgError);
    }

    // Definir org ativa
    const { error: orgAtivaError } = await supabaseAdmin
      .from("user_org_ativa")
      .upsert({
        user_id: newUser.user.id,
        org_id: targetOrgId
      }, { onConflict: "user_id" });

    if (orgAtivaError) {
      console.error("Erro ao definir org ativa:", orgAtivaError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user.id,
          email: newUser.user.email
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Erro inesperado:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
