import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const appUrl = Deno.env.get("APP_URL") || "https://marketingdasprent-alt.lovable.app";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

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

    // 3. Enviar Email via Brevo
    if (tipo === 'falta_fatura' && brevoApiKey) {
      const subject = `⚠️ Fatura Pendente: Assistência #${String(ticket.numero).padStart(4, '0')} (${ticket.viatura?.matricula})`;
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
          <div style="background: #ef4444; padding: 24px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">⚠️ Falta de Fatura Detetada</h1>
          </div>
          <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
            <p>Olá,</p>
            <p>A assistência abaixo foi concluída, mas <strong>não possui uma fatura anexada</strong>:</p>
            <div style="background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Ticket:</strong> #${String(ticket.numero).padStart(4, '0')}</p>
              <p style="margin: 5px 0;"><strong>Viatura:</strong> ${ticket.viatura?.matricula}</p>
              <p style="margin: 5px 0;"><strong>Título:</strong> ${ticket.titulo}</p>
            </div>
            <p>Por favor, anexe a fatura correspondente para garantir o controlo financeiro correto.</p>
            <div style="text-align: center; margin-top: 30px;">
              <a href="${appUrl}/assistencia/${ticket_id}" 
                 style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                 Ver Detalhes do Ticket
              </a>
            </div>
          </div>
          <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 20px;">
            © ${new Date().getFullYear()} Década Ousada. Notificação automática de gestão.
          </p>
        </body>
        </html>
      `;

      await Promise.all(emails.map(email => 
        fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 
            'accept': 'application/json', 
            'api-key': brevoApiKey, 
            'content-type': 'application/json' 
          },
          body: JSON.stringify({
            sender: { name: "Gestão Década Ousada", email: "noreply@dasprent.pt" },
            to: [{ email }],
            subject,
            htmlContent
          })
        })
      ));
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
