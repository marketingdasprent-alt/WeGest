import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EmailService } from "../_shared/email/services/EmailService.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "motoristas.tvde@distanciaarrojada.pt";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, nome } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const emailService = new EmailService(supabase);

    // Página pública, sem sessão/tenant conhecido. Resolve a org pelo email
    // do motorista que pede eliminação; se não encontrado (ex.: conta não é
    // motorista), cai na primeira org ativa — hoje o fluxo já está hardcoded
    // a 1 org (ADMIN_EMAIL da Distância Arrojada), por isso não regride nada.
    let orgId: string | null = null;
    const { data: motorista } = await supabase
      .from('motoristas_ativos')
      .select('org_id')
      .eq('email', email)
      .maybeSingle();
    orgId = motorista?.org_id ?? null;

    if (!orgId) {
      const { data: fallbackOrg } = await supabase
        .from('organizacoes')
        .select('id')
        .eq('ativa', true)
        .limit(1)
        .maybeSingle();
      orgId = fallbackOrg?.id ?? null;
    }

    if (!orgId) throw new Error('Não foi possível determinar a organização para este pedido');

    const requestedAt = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });

    await emailService.sendEliminacaoConta(orgId, {
      to: ADMIN_EMAIL,
      toNome: "Suporte WeGest",
      destinatario: 'admin',
      email,
      nome,
      requestedAt,
      adminEmail: ADMIN_EMAIL,
    });

    await emailService.sendEliminacaoConta(orgId, {
      to: email,
      toNome: nome || email.split("@")[0],
      destinatario: 'confirmacao',
      email,
      nome,
      requestedAt,
      adminEmail: ADMIN_EMAIL,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Pedido enviado com sucesso" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Erro ao processar pedido de eliminação:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
