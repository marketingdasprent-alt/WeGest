import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EmailService } from "../_shared/email/services/EmailService.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matricula, cidade, tipo, data_inicio, dia_todo, org_id: orgId } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!orgId) throw new Error("org_id é obrigatório");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const emailService = new EmailService(supabase);

    // 1. Membros (não-motoristas) DESTA org — recipientes scoped por user_organizacoes.
    const { data: orgMembers, error: membersError } = await supabase
      .from("user_organizacoes")
      .select("user_id")
      .eq("org_id", orgId);

    if (membersError) {
      console.warn("Erro ao buscar membros da org:", membersError.message);
    }

    const memberIds = (orgMembers || []).map((m: any) => m.user_id);
    const gestorIds: string[] = [];

    if (memberIds.length > 0) {
      // Excluir motoristas (tipo_utilizador é identidade global em profiles).
      const { data: gestorProfiles } = await supabase
        .from("profiles")
        .select("id")
        .in("id", memberIds)
        .neq("tipo_utilizador", "motorista");
      for (const p of gestorProfiles || []) gestorIds.push(p.id as string);
    }

    const gestorEmails: string[] = [];

    if (gestorIds.length > 0) {
      // Obter emails via admin API
      const { data: usersData, error: usersError } =
        await supabase.auth.admin.listUsers({ perPage: 1000 });

      if (usersError) {
        console.warn("Erro ao listar utilizadores:", usersError.message);
      } else {
        const gestorIdSet = new Set(gestorIds);
        for (const u of usersData.users) {
          if (gestorIdSet.has(u.id) && u.email) {
            gestorEmails.push(u.email);
          }
        }
      }
    }

    // 2. Buscar CCs extras configurados manualmente em calendario_config (DESTA org)
    const { data: configs } = await supabase
      .from("calendario_config")
      .select("email_cc")
      .eq("org_id", orgId)
      .not("email_cc", "is", null);

    const extraCcEmails = (configs || [])
      .map((c: any) => c.email_cc)
      .filter((e: string) => e && e.includes("@"));

    // 3. Unir e deduplicar todos os emails
    const allEmails = [...new Set([...gestorEmails, ...extraCcEmails])];

    if (allEmails.length === 0) {
      console.log("Nenhum email de gestor encontrado para notificar");
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(
      `A enviar notificacao para ${allEmails.length} gestor(es):`,
      allEmails
    );

    let totalSent = 0;
    for (const email of allEmails) {
      const result = await emailService.sendCalendarNotification(orgId, {
        to: email,
        matricula,
        cidade,
        tipo,
        dataInicio: data_inicio,
        diaTodo: dia_todo,
      });

      if (result.success) {
        console.log(`Notificacao enviada para ${email}`);
        totalSent++;
      } else {
        console.error(`Erro ao enviar notificacao para ${email}:`, result.error);
      }
    }

    return new Response(JSON.stringify({ success: true, sent: totalSent }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Erro na notificacao:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
