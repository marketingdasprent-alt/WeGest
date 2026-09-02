import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EmailProviderFactory } from "../_shared/email/factories/EmailProviderFactory.ts";
import { renderTemplate } from "../_shared/notification-queue/renderTemplate.ts";
import { batchLoadEnrichment, type QueueItemEnrichment } from "../_shared/notification-queue/enrichContext.ts";
import { buildGenericEmailHtml } from "../_shared/notification-queue/buildGenericEmailHtml.ts";
import { EmailService } from "../_shared/email/services/EmailService.ts";
import type { EmailSendResult } from "../_shared/email/types/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

interface QueueItem {
  id: string;
  org_id: string;
  notification_id: string;
  destinatario: string;
  template_codigo: string;
  // deno-lint-ignore no-explicit-any
  payload_render: Record<string, any>;
  created_at: string;
}

function fmtDatePt(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-PT");
}

// Dias entre hoje e a data (negativo se a data já passou).
function diasEntreHojeE(value: unknown): number {
  if (!value) return 0;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - hoje.getTime()) / 86_400_000);
}

const JOB_NOME_POR_TIPO: Record<string, string> = {
  via_verde_sync: "Sincronização Via Verde",
};

type TemplateHandler = (
  item: QueueItem,
  ctx: QueueItemEnrichment,
  emailService: EmailService
) => Promise<EmailSendResult>;

// Um handler por template_codigo dos domain events que já têm o template HTML
// novo com método próprio em EmailService. Qualquer template_codigo fora
// deste mapa (ex.: digest.resumo_diario, cobranca.gerada) continua a usar o
// caminho genérico (notification_templates + renderTemplate) mais abaixo.
const TEMPLATE_HANDLERS: Record<string, TemplateHandler> = {
  "sistema.job_falhou": (item, ctx, es) => {
    const p = item.payload_render;
    const args = {
      descricaoErro: p.last_error ?? "Sem detalhe",
      destinatarioNome: ctx.destinatarioNome,
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: ctx.destinatarioNome,
    };
    return p.job_type === "via_verde_sync"
      ? es.sendViaVerdeSyncFalha(item.org_id, args)
      : es.sendJobFalha(item.org_id, {
          ...args,
          jobNome: JOB_NOME_POR_TIPO[p.job_type as string] ?? p.job_type ?? p.source_table ?? "Job agendado",
        });
  },

  "viatura.seguro_expirando": (item, ctx, es) => {
    const p = item.payload_render;
    return es.sendDocumentoViatura(item.org_id, {
      tipo: "seguro",
      matricula: p.matricula,
      marcaModelo: ctx.viaturaMarcaModelo,
      dataValidadeFmt: fmtDatePt(p.seguro_validade),
      diasRestantes: diasEntreHojeE(p.seguro_validade),
      destinatarioNome: ctx.destinatarioNome,
      empresaNome: ctx.emissorNome,
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: ctx.destinatarioNome,
    });
  },

  "viatura.inspecao_expirando": (item, ctx, es) => {
    const p = item.payload_render;
    return es.sendDocumentoViatura(item.org_id, {
      tipo: "ipo",
      matricula: p.matricula,
      marcaModelo: ctx.viaturaMarcaModelo,
      dataValidadeFmt: fmtDatePt(p.inspecao_validade),
      diasRestantes: diasEntreHojeE(p.inspecao_validade),
      destinatarioNome: ctx.destinatarioNome,
      empresaNome: ctx.emissorNome,
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: ctx.destinatarioNome,
    });
  },

  "viatura.extintor_expirando": (item, ctx, es) => {
    const p = item.payload_render;
    return es.sendDocumentoViatura(item.org_id, {
      tipo: "documento",
      matricula: p.matricula,
      marcaModelo: ctx.viaturaMarcaModelo,
      dataValidadeFmt: fmtDatePt(p.extintor_validade),
      diasRestantes: diasEntreHojeE(p.extintor_validade),
      destinatarioNome: ctx.destinatarioNome,
      empresaNome: ctx.emissorNome,
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: ctx.destinatarioNome,
    });
  },

  "viatura.iuc_a_pagar": (item, ctx, es) => {
    const p = item.payload_render;
    return es.sendDocumentoViatura(item.org_id, {
      tipo: "iuc",
      matricula: p.matricula,
      marcaModelo: [p.marca, p.modelo].filter(Boolean).join(" ") || ctx.viaturaMarcaModelo,
      dataValidadeFmt: fmtDatePt(p.proxima_data_iuc),
      diasRestantes: diasEntreHojeE(p.proxima_data_iuc),
      destinatarioNome: ctx.destinatarioNome,
      empresaNome: ctx.emissorNome,
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: ctx.destinatarioNome,
    });
  },

  "viatura.manutencao_preventiva_expirando": (item, ctx, es) => {
    const p = item.payload_render;
    const temData = Boolean(p.proxima_manutencao_data);
    return es.sendDocumentoViatura(item.org_id, {
      tipo: "manutencao_preventiva",
      matricula: p.matricula,
      marcaModelo: ctx.viaturaMarcaModelo,
      dataValidadeFmt: temData
        ? fmtDatePt(p.proxima_manutencao_data)
        : `${p.proxima_manutencao_km ?? "?"} km`,
      diasRestantes: temData ? diasEntreHojeE(p.proxima_manutencao_data) : 0,
      kmPrevistos: p.proxima_manutencao_km ?? undefined,
      destinatarioNome: ctx.destinatarioNome,
      empresaNome: ctx.emissorNome,
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: ctx.destinatarioNome,
    });
  },

  "motorista.candidatura_parada": (item, ctx, es) => {
    const p = item.payload_render;
    return es.sendCandidaturaPendente(item.org_id, {
      candidatoNome: p.nome,
      destinatarioNome: ctx.destinatarioNome,
      empresaNome: ctx.emissorNome,
      dataSubmissaoFmt: fmtDatePt(p.data_submissao),
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: ctx.destinatarioNome,
    });
  },

  "contrato_renting.sem_checkin": (item, ctx, es) => {
    const p = item.payload_render;
    return es.sendReservaSemCheckin(item.org_id, {
      matricula: p.matricula,
      motoristaNome: p.cliente_nome,
      dataHoraPrevistaFmt: fmtDatePt(p.data_fim),
      destinatarioNome: ctx.destinatarioNome,
      empresaNome: ctx.emissorNome,
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: ctx.destinatarioNome,
    });
  },

  // Destinatário é o cliente do contrato (estratégia 'cliente_contrato') —
  // o nome já vem no payload (cliente_nome), sem precisar de enriquecimento.
  "contrato_renting.criado": (item, ctx, es) => {
    const p = item.payload_render;
    const destinatarioNome = p.cliente_nome ?? ctx.destinatarioNome ?? "Cliente";
    return es.sendContrato(item.org_id, {
      tipo: "criado",
      destinatarioNome,
      matricula: p.matricula,
      dataInicioFmt: fmtDatePt(p.data_inicio),
      valorMensal: typeof p.valor === "number" ? p.valor : undefined,
      motoristaNome: p.cliente_nome,
      emissorNome: ctx.emissorNome,
      emissorLogoUrl: ctx.emissorLogoUrl,
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: destinatarioNome,
    });
  },

  "motorista.reparacao_cobranca": (item, ctx, es) => {
    const p = item.payload_render;
    const destinatarioNome = ctx.motoristaNome ?? "Motorista";
    return es.sendReparacaoConcluida(item.org_id, {
      destinatarioNome,
      matricula: p.matricula,
      descricaoReparacao: p.descricao,
      valorACobrar: p.valor,
      motoristaNome: ctx.motoristaNome,
      emissorNome: ctx.emissorNome,
      emissorLogoUrl: ctx.emissorLogoUrl,
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: destinatarioNome,
    });
  },

  "assistencia_ticket.aberto_demasiado_tempo": (item, ctx, es) => {
    const p = item.payload_render;
    return es.sendReparacaoAbertaDemorada(item.org_id, {
      matricula: p.matricula,
      descricaoReparacao: p.titulo,
      diasAberta: Math.abs(diasEntreHojeE(p.criado_em)),
      destinatarioNome: ctx.destinatarioNome,
      empresaNome: ctx.emissorNome,
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: ctx.destinatarioNome,
    });
  },

  "motorista.ficha_incompleta": (item, ctx, es) => {
    const p = item.payload_render;
    return es.sendFichaIncompleta(item.org_id, {
      destinatarioNome: p.nome,
      camposEmFalta: Array.isArray(p.campos_em_falta) ? p.campos_em_falta : [],
      motoristaNome: p.nome,
      emissorNome: ctx.emissorNome,
      emissorLogoUrl: ctx.emissorLogoUrl,
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: p.nome,
    });
  },

  "seguranca.login_suspeito": (item, ctx, es) =>
    es.sendLoginSuspeito(item.org_id, {
      destinatarioNome: ctx.destinatarioNome,
      dataHoraFmt: new Date(item.created_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }),
      ctaUrl: ctx.ctaUrl,
      to: item.destinatario,
      toNome: ctx.destinatarioNome,
    }),
};

// Caminho genérico atual (notification_templates + {{var}} interpolação) —
// mantido tal e qual para qualquer template_codigo fora do TEMPLATE_HANDLERS
// (ex.: digest.resumo_diario, cobranca.gerada, invoice.nao_enviada_ao_cliente).
// `ctx` é o mesmo enriquecimento (ctaUrl, marca da org, nome do
// destinatário) que o caminho TEMPLATE_HANDLERS já recebia — só faltava
// chegar aqui.
async function sendViaGenericTemplate(
  item: QueueItem,
  supabase: SupabaseClient,
  ctx: QueueItemEnrichment
): Promise<EmailSendResult> {
  const { data: template, error: templateError } = await supabase
    .from("notification_templates")
    .select("assunto, corpo_template")
    .eq("org_id", item.org_id)
    .eq("codigo", item.template_codigo)
    .eq("canal", "email")
    .eq("ativo", true)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (templateError) throw templateError;
  if (!template) throw new Error(`template não encontrado: ${item.template_codigo}`);

  const vars = item.payload_render ?? {};
  const subject = renderTemplate(template.assunto ?? "", vars);
  const corpo = renderTemplate(template.corpo_template, vars);
  const html = buildGenericEmailHtml(subject, corpo, ctx);

  const { provider, sender } = await EmailProviderFactory.getProvider(item.org_id, supabase);
  return await provider.send({
    to: [{ email: item.destinatario }],
    subject,
    html,
    senderOverride: sender,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const emailService = new EmailService(supabase);

  try {
    const { data: items, error: claimError } = await supabase.rpc("notification_queue_claim", {
      p_canal: "email",
      p_max: 20,
    });

    if (claimError) throw claimError;

    const queueItems: QueueItem[] = items ?? [];
    const enrichment = await batchLoadEnrichment(queueItems, supabase);

    let sent = 0;
    let failed = 0;

    for (const item of queueItems) {
      try {
        const handler = TEMPLATE_HANDLERS[item.template_codigo];
        const result = handler
          ? await handler(item, enrichment.get(item.id) ?? {}, emailService)
          : await sendViaGenericTemplate(item, supabase, enrichment.get(item.id) ?? {});

        await supabase.from("notification_delivery").insert({
          notification_queue_id: item.id,
          notification_id: item.notification_id,
          org_id: item.org_id,
          canal: "email",
          destinatario: item.destinatario,
          provider: "brevo",
          provider_message_id: result.providerMessageId ?? null,
          status: result.success ? "enviado" : "falhado",
          erro: result.success ? null : result.error ?? null,
        });

        if (result.success) {
          await supabase.rpc("notification_queue_complete", { p_id: item.id });
          sent++;
        } else {
          await supabase.rpc("notification_queue_fail", {
            p_id: item.id,
            p_error: result.error ?? "falha desconhecida no envio",
          });
          failed++;
        }
      } catch (itemError) {
        await supabase.rpc("notification_queue_fail", {
          p_id: item.id,
          p_error: itemError instanceof Error ? itemError.message : String(itemError),
        });
        failed++;
      }
    }

    return new Response(JSON.stringify({ success: true, sent, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-notification-queue-email falhou:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
