import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIPO_LABELS: Record<string, string> = {
  entrega: "Entrega",
  recolha: "Recolha",
  devolucao: "Devolucao",
  troca: "Troca",
  upgrade: "Upgrade",
};

function formatMatricula(val: string): string {
  const clean = val.replace(/[-\s]/g, "").toUpperCase();
  return clean.match(/.{1,2}/g)?.join("-") || clean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { matricula, cidade, tipo, data_inicio, dia_todo, org_id: orgId } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");

    if (!brevoApiKey) throw new Error("BREVO_API_KEY not configured");
    if (!orgId) throw new Error("org_id é obrigatório");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

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

    const dataEvento = new Date(data_inicio);
    const dataFormatada = dataEvento.toLocaleDateString("pt-PT", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const horaFormatada = dia_todo
      ? "Dia inteiro"
      : dataEvento.toLocaleTimeString("pt-PT", {
          hour: "2-digit",
          minute: "2-digit",
        });
    const matriculaFormatada = formatMatricula(matricula);
    const cidadeFormatada = cidade ? cidade.toUpperCase() : "";
    const tipoLabel = TIPO_LABELS[tipo] || tipo;

    const subject = `Novo evento: ${tipoLabel} - ${matriculaFormatada}${
      cidadeFormatada ? " " + cidadeFormatada : ""
    }`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #1a1a2e; padding: 24px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
    <h1 style="color: #fff; margin: 0; font-size: 22px;">Novo Evento no Calendario</h1>
  </div>
  <div style="background: #f9f9f9; padding: 24px; border-radius: 10px;">
    <h2 style="margin-top: 0;">${matriculaFormatada}${
      cidadeFormatada ? " - " + cidadeFormatada : ""
    }</h2>
    <p><strong>Tipo:</strong> ${tipoLabel}</p>
    <p><strong>Data:</strong> ${dataFormatada}</p>
    <p><strong>Hora:</strong> ${horaFormatada}</p>
  </div>
  <p style="color: #666; font-size: 12px; text-align: center; margin-top: 20px;">
    Decada Ousada - Email automatico gerado pelo sistema WeGest.
  </p>
</body>
</html>
    `;

    let totalSent = 0;
    for (const email of allEmails) {
      const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": brevoApiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "Decada Ousada", email: "noreply@dasprent.pt" },
          to: [{ email }],
          subject,
          htmlContent,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json();
        console.error(`Erro Brevo para ${email}:`, errData);
      } else {
        console.log(`Notificacao enviada para ${email}`);
        totalSent++;
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
