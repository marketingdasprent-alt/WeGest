import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EmailService } from "../_shared/email/services/EmailService.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const emailService = new EmailService(supabase);

    const now = new Date();
    const currentHour = now.getUTCHours(); // UTC

    // We determine "today" and "tomorrow" in Europe/Lisbon (UTC+0 or UTC+1)
    // Simplified: use UTC dates
    const todayStr = now.toISOString().slice(0, 10);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    let totalSent = 0;

    // 1. Véspera reminders: events tomorrow where lembrete_enviado_vespera = false
    const { data: vesperaEvents, error: vesperaError } = await supabase
      .from('calendario_eventos')
      .select('*')
      .gte('data_inicio', `${tomorrowStr}T00:00:00Z`)
      .lt('data_inicio', `${tomorrowStr}T23:59:59Z`)
      .eq('lembrete_enviado_vespera', false);

    if (vesperaError) {
      console.error('Erro ao buscar eventos véspera:', vesperaError);
    }

    for (const evento of (vesperaEvents || [])) {
      await sendReminder(supabase, emailService, evento, 'vespera');
      await supabase
        .from('calendario_eventos')
        .update({ lembrete_enviado_vespera: true })
        .eq('id', evento.id);
      totalSent++;
    }

    // 2. Day reminders: events today where lembrete_enviado_dia = false
    // Send around 8h UTC (adjust if needed for Lisbon time)
    if (currentHour >= 7 && currentHour <= 9) {
      const { data: diaEvents, error: diaError } = await supabase
        .from('calendario_eventos')
        .select('*')
        .gte('data_inicio', `${todayStr}T00:00:00Z`)
        .lt('data_inicio', `${todayStr}T23:59:59Z`)
        .eq('lembrete_enviado_dia', false);

      if (diaError) {
        console.error('Erro ao buscar eventos do dia:', diaError);
      }

      for (const evento of (diaEvents || [])) {
        await sendReminder(supabase, emailService, evento, 'dia');
        await supabase
          .from('calendario_eventos')
          .update({ lembrete_enviado_dia: true })
          .eq('id', evento.id);
        totalSent++;
      }
    }

    console.log(`Lembretes enviados: ${totalSent}`);

    return new Response(JSON.stringify({ success: true, sent: totalSent }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Erro nos lembretes:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

async function sendReminder(
  supabase: any,
  emailService: EmailService,
  evento: any,
  tipo: 'vespera' | 'dia'
) {
  if (!evento.org_id) {
    console.log(`Evento ${evento.id} sem org_id — a saltar lembrete`);
    return;
  }

  // Get creator email from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, nome')
    .eq('id', evento.criado_por)
    .single();

  if (!profile?.email) {
    console.log(`Sem email para o criador ${evento.criado_por}`);
    return;
  }

  // Get CC email
  const { data: config } = await supabase
    .from('calendario_config')
    .select('email_cc')
    .eq('user_id', evento.criado_por)
    .maybeSingle();

  const result = await emailService.sendReminder(evento.org_id, {
    to: profile.email,
    toNome: profile.nome || profile.email,
    ccEmail: config?.email_cc,
    variant: tipo,
    titulo: evento.titulo,
    tipo: evento.tipo,
    cidade: evento.cidade,
    dataInicio: evento.data_inicio,
    diaTodo: evento.dia_todo,
  });

  if (!result.success) {
    console.error(`Erro Brevo para ${profile.email}:`, result.error);
  } else {
    console.log(`Lembrete ${tipo} enviado para ${profile.email} - ${evento.titulo}`);
  }
}
