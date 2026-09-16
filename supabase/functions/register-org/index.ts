import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { buildCargoPermissoes } from "../_shared/register-org/buildCargoPermissoes.ts";
import { EmailService } from "../_shared/email/services/EmailService.ts";

// Registo público de uma organização nova (/registar-org). Anónimo por
// natureza — quem se regista ainda não tem conta. Três defesas, todas
// desta função (auditoria 2026-09-16):
//
//   · O administrador nasce por confirmar (email_confirm: false) e recebe um
//     link de confirmação por email; só depois de clicar é que a sessão abre.
//     Antes, `email_confirm: true` dava acesso de administrador a quem
//     escrevesse o email de outra pessoa.
//   · O email não é enumerável: se já existir, a resposta é a MESMA que no
//     sucesso (a pessoa recebe um email a dizer que já tem conta) — nada na
//     resposta HTTP distingue os dois casos. Código/nome/NIF continuam a ser
//     verificados abertamente: o código é público por definição (é o
//     subdomínio) e o nome/NIF de uma empresa não são dados pessoais.
//   · Limite por origem (5 registos/hora por IP, hash sem guardar o IP).
//     Contador em memória do isolate — melhor esforço, suficiente para travar
//     scripts; um limite duradouro exigiria uma tabela própria.
//
// org_id/cargo_id do administrador vão em app_metadata — a única fonte que o
// trigger handle_new_user_org aceita. O override manual abaixo fica como
// rede de segurança idempotente.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESERVED_CODIGOS = new Set([
  "www", "api", "app", "admin", "mail", "ftp", "smtp", "pop", "imap",
  "ns1", "ns2", "staging", "dev", "test", "cdn", "static", "assets",
  "decada", "distancia", "wegest", "suporte", "help", "login", "register",
]);

const LIMITE_POR_HORA = 5;
const JANELA_MS = 3_600_000;
const tentativasPorOrigem = new Map<string, number[]>();

const RESPOSTA_SUCESSO_GENERICA = {
  success: true,
  pendente_confirmacao: true,
  message:
    "Registo recebido. Enviámos um email para confirmar o endereço — a conta fica ativa depois de clicar no link.",
};

/** Hash da origem com um segredo do projecto: conta o limite sem guardar o IP. */
async function hashOrigem(ip: string): Promise<string> {
  const segredo = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const dados = new TextEncoder().encode(`${segredo}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function origemDoPedido(req: Request): string {
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  const xForwardedFor = req.headers.get("x-forwarded-for");
  return (
    cfConnectingIp ??
    (xForwardedFor ? xForwardedFor.split(",").pop()?.trim() : undefined) ??
    "desconhecido"
  );
}

function excedeuLimite(origem: string): boolean {
  const agora = Date.now();
  const recentes = (tentativasPorOrigem.get(origem) ?? []).filter((t) => agora - t < JANELA_MS);
  recentes.push(agora);
  tentativasPorOrigem.set(origem, recentes);
  if (tentativasPorOrigem.size > 5000) {
    // Não deixar o mapa crescer sem fim num isolate longo.
    for (const [k, v] of tentativasPorOrigem) {
      if (v.every((t) => agora - t >= JANELA_MS)) tentativasPorOrigem.delete(k);
    }
  }
  return recentes.length > LIMITE_POR_HORA;
}

function isValidEmail(email: string): boolean {
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return !!local && !!domain && domain.includes(".");
}

function resolveRedirect(req: Request): string {
  const siteUrl = (Deno.env.get("SUPABASE_SITE_URL") || "").replace(/\/$/, "");
  const origin = req.headers.get("origin");
  try {
    if (origin) {
      const u = new URL(origin);
      if (u.hostname === "wegest.pt" || u.hostname.endsWith(".wegest.pt") || u.hostname === "localhost") {
        return `${u.origin}/login`;
      }
    }
  } catch {
    /* origin inválido — cai no default */
  }
  return `${siteUrl || new URL(req.url).origin}/login`;
}

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
    const origem = await hashOrigem(origemDoPedido(req));
    if (excedeuLimite(origem)) {
      return jsonResponse({ error: "Demasiados registos. Tente dentro de uma hora." }, 429);
    }

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

    if (typeof admin_email !== "string" || !isValidEmail(admin_email.trim())) {
      return jsonResponse({ error: "Indique um email válido." }, 400);
    }
    const emailNorm = admin_email.trim().toLowerCase();

    const codigoLower = String(codigo).trim().toLowerCase();

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

    if (String(admin_password).length < 6) {
      return jsonResponse({ error: "A password deve ter pelo menos 6 caracteres." }, 400);
    }

    // Verificar se o código já existe
    const { data: existingOrg } = await supabase
      .from("organizacoes")
      .select("id")
      .eq("codigo", codigoLower)
      .maybeSingle();

    if (existingOrg) {
      return jsonResponse({ error: "Este código já está em uso. Escolha outro." }, 400);
    }

    // Verificar se o NOME da empresa já existe (case-insensitive).
    // Escapa % e _ para não serem tratados como wildcards do ilike.
    const nomeNormalizado = String(nome_empresa).trim();
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
    const nifNormalizado = String(nif).trim();
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

    // ========== EMAIL JÁ REGISTADO → resposta indistinguível do sucesso ==========
    // Sem listUsers() a percorrer toda a base: profiles.email é a mesma
    // informação, indexada. Não se cria a organização — a pessoa que tem esse
    // email recebe um aviso, e quem submeteu vê a mesma mensagem que veria
    // num registo normal.
    const { data: perfilExistente } = await supabase
      .from("profiles")
      .select("id, org_id")
      .eq("email", emailNorm)
      .limit(1)
      .maybeSingle();

    if (perfilExistente) {
      console.log(`[register-org] Tentativa de registo com email já existente (org pendente: ${codigoLower})`);
      try {
        const emailService = new EmailService(supabase);
        const { data: link } = await supabase.auth.admin.generateLink({
          type: "recovery",
          email: emailNorm,
          options: { redirectTo: resolveRedirect(req).replace(/\/login$/, "/reset-password") },
        } as any);
        // @ts-ignore - properties shape provided by Supabase
        const actionLink = (link?.properties as any)?.action_link as string | undefined;
        if (actionLink && perfilExistente.org_id) {
          await emailService.sendAuthEmail(perfilExistente.org_id, {
            to: emailNorm,
            type: "password_recovery",
            actionLink,
          });
        }
      } catch (e) {
        console.warn("[register-org] aviso a email existente falhou:", e);
      }
      return jsonResponse(RESPOSTA_SUCESSO_GENERICA);
    }

    // ========== CRIAR ORGANIZAÇÃO ==========
    const { data: org, error: orgError } = await supabase
      .from("organizacoes")
      .insert({
        nome: nomeNormalizado,
        codigo: codigoLower,
        nif: nifNormalizado,
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

    // ========== CARGO ADMIN ==========
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
      await supabase.from("organizacoes").delete().eq("id", org.id);
      return jsonResponse({ error: "Erro ao criar cargo de administrador" }, 500);
    }

    console.log(`[register-org] Cargo admin: ${cargo.id}`);

    // ========== CRIAR USER ADMIN (por confirmar) ==========
    // app_metadata é o que o trigger handle_new_user_org lê para org/cargo —
    // só o servidor a escreve. O utilizador nasce POR CONFIRMAR: o link de
    // confirmação vai por email e só depois de clicar é que entra.
    const { data: newUser, error: userError } = await supabase.auth.admin.createUser({
      email: emailNorm,
      password: admin_password,
      email_confirm: false,
      user_metadata: {
        nome: String(admin_nome).trim(),
        tipo_utilizador: "colaborador",
      },
      app_metadata: {
        org_id: org.id,
        cargo_id: cargo.id,
        tipo_utilizador: "colaborador",
      },
    });

    if (userError) {
      console.error("[register-org] Erro ao criar user:", userError);
      // Rollback: apagar a org criada (os cargos caem em cascata).
      await supabase.from("organizacoes").delete().eq("id", org.id);
      const jaExiste = /already.*(registered|exists)/i.test(userError.message || "");
      // Corrida entre a verificação em profiles e o createUser: mesma
      // resposta genérica, para não confirmar a existência do email.
      if (jaExiste) return jsonResponse(RESPOSTA_SUCESSO_GENERICA);
      return jsonResponse({ error: "Erro ao criar utilizador." }, 500);
    }

    const userId = newUser.user.id;
    console.log(`[register-org] User criado (por confirmar): ${userId}`);

    // ========== ASSOCIAR USER À ORG (rede de segurança, idempotente) ==========
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        org_id: org.id,
        cargo_id: cargo.id,
        cargo: "Administrador",
        is_admin: true,
      })
      .eq("id", userId);

    if (profileError) {
      console.error("[register-org] Erro ao atualizar profile:", profileError);
      return jsonResponse({ error: "Erro ao configurar perfil do admin: " + profileError.message }, 500);
    }

    const { error: userOrgError } = await supabase
      .from("user_organizacoes")
      .upsert(
        { user_id: userId, org_id: org.id, role: "owner", cargo_id: cargo.id, is_admin: true },
        { onConflict: "user_id,org_id" }
      );

    if (userOrgError) {
      console.error("[register-org] Erro ao associar user à org:", userOrgError);
    }

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

    // ========== EMAIL DE CONFIRMAÇÃO ==========
    // Link de confirmação de signup gerado pelo Supabase e enviado pela nossa
    // integração de email (a org nova ainda não tem a sua; cai no fornecedor
    // por omissão). Se o envio falhar, a org fica criada e por confirmar — o
    // utilizador pode pedir "reenviar" no login.
    let emailEnviado = false;
    try {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "signup",
        email: emailNorm,
        password: admin_password,
        options: { redirectTo: resolveRedirect(req) },
      } as any);
      if (linkError || !linkData) throw new Error(linkError?.message || "sem link");
      // @ts-ignore - properties shape provided by Supabase
      const actionLink = (linkData.properties as any).action_link as string;

      const emailService = new EmailService(supabase);
      const result = await emailService.sendOrgConfirmacao(org.id, {
        to: emailNorm,
        nomeEmpresa: nomeNormalizado,
        actionLink,
      });
      emailEnviado = result.success;
      if (!result.success) console.error("[register-org] envio da confirmação falhou:", result.error);
    } catch (e) {
      console.error("[register-org] confirmação por email falhou:", e);
    }

    console.log(`[register-org] Setup completo para org ${org.codigo}; confirmação enviada: ${emailEnviado}`);

    return jsonResponse({
      ...RESPOSTA_SUCESSO_GENERICA,
      org: {
        id: org.id,
        codigo: org.codigo,
        subdomain: `${org.codigo}.wegest.pt`,
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
