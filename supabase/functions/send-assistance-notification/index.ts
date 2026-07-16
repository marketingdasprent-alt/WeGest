import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EmailService } from "../_shared/email/services/EmailService.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticket_id, tipo } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const appUrl = Deno.env.get("APP_URL") || "https://marketingdasprent-alt.lovable.app";

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const emailService = new EmailService(supabase);

    // 1. Buscar detalhes do ticket (org_id deriva daqui — scope dos recipientes)
    const { data: ticket, error: tError } = await supabase
      .from('assistencia_tickets')
      .select('numero, titulo, org_id, viatura:viaturas(matricula)')
      .eq('id', ticket_id)
      .single();

    if (tError) throw tError;

    const orgId = ticket.org_id;

    // 2. Recipientes = membros DESTA org que são admin ou Gestor de Assistência
    //    (papel per-org em user_organizacoes, não o cargo legado de profiles).
    const { data: orgMembers, error: gError } = await supabase
      .from('user_organizacoes')
      .select('user_id, is_admin, cargos(nome)')
      .eq('org_id', orgId);

    if (gError) throw gError;

    const recipientIds = (orgMembers || [])
      .filter((m: any) => {
        const cargoNome = (m.cargos?.nome || '').toLowerCase();
        return m.is_admin || cargoNome.includes('gestor de assistência') || cargoNome.includes('gestor de assistencia');
      })
      .map((m: any) => m.user_id);

    let emails: string[] = [];
    if (recipientIds.length > 0) {
      const { data: gestores } = await supabase
        .from('profiles')
        .select('email')
        .in('id', recipientIds)
        .not('email', 'is', null);
      emails = (gestores || [])
        .map((g: any) => g.email)
        .filter((e: string): e is string => !!e && e.includes('@'));
    }

    if (emails.length === 0) {
      console.log('Nenhum gestor com email encontrado');
      return new Response(JSON.stringify({ success: true, message: "Sem destinatários" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`Enviando notificações para ${emails.length} gestores...`);

    // 3. Enviar Email
    if (tipo === 'falta_fatura') {
      await Promise.all(
        emails.map((email) =>
          emailService.sendAssistanceNotification(orgId, {
            to: email,
            ticketId: ticket_id,
            ticketNumero: ticket.numero,
            viaturaMatricula: ticket.viatura?.matricula,
            ticketTitulo: ticket.titulo,
            appUrl,
          })
        )
      );
    }

    // 4. Disparar Webhook para Push (usando o sistema existente)
    try {
      await supabase.functions.invoke('send-webhook', {
        body: {
          evento: 'ticket_concluido_sem_fatura',
          dados: {
            ticket_id,
            numero: ticket.numero,
            matricula: ticket.viatura?.matricula,
            alerta: `Assistência #${ticket.numero} concluída sem fatura anexada.`
          }
        }
      });
    } catch (whError) {
      console.warn('Erro ao disparar webhook secundário:', whError);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error('Erro em send-assistance-notification:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
