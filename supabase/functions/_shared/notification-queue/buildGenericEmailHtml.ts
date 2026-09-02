import { notificacaoTemplate } from "../email/templates/notificacao.ts";
import type { QueueItemEnrichment } from "./enrichContext.ts";

// O caminho genérico (notification_templates + {{tokens}}) não tinha
// nenhum layout — mandava o corpo tal e qual como html. Isto põe-no dentro
// da mesma moldura que os 13 templates escritos à mão já usam
// (notificacaoTemplate), reaproveitando o enriquecimento que o lote da fila
// já calcula (ctaUrl, marca da organização, nome do destinatário) mas que
// só o caminho TEMPLATE_HANDLERS usava até agora.
export function buildGenericEmailHtml(
  titulo: string,
  corpo: string,
  ctx: QueueItemEnrichment
): string {
  return notificacaoTemplate({
    titulo,
    corpo,
    destinatarioNome: ctx.destinatarioNome,
    emissorNome: ctx.emissorNome,
    emissorLogoUrl: ctx.emissorLogoUrl,
    ctaLabel: ctx.ctaUrl ? "Ver detalhes" : undefined,
    ctaUrl: ctx.ctaUrl,
  });
}
