import { EmailProviderFactory } from '../factories/EmailProviderFactory.ts';
import { EmailConfigError, EmailProviderError, EmailValidationError } from '../errors/index.ts';
import { calendarNotificationTemplate, type CalendarNotificationInput } from '../templates/calendarNotification.ts';
import { folhaDanosTemplate } from '../templates/folhaDanos.ts';
import { documentoFiscalTemplate } from '../templates/documentoFiscal.ts';
import {
  assistanceNotificationTemplate,
  type AssistanceNotificationInput,
} from '../templates/assistanceNotification.ts';
import { alertasExpiracoesTemplate, type AlertasExpiracoesInput } from '../templates/alertasExpiracoes.ts';
import {
  reciboAnuladoMotoristaTemplate,
  reciboAnuladoGestorTemplate,
  type ReciboAnuladoInput,
} from '../templates/reciboAnulado.ts';
import { reminderTemplate, type ReminderInput } from '../templates/reminder.ts';
import {
  eliminacaoContaAdminTemplate,
  eliminacaoContaConfirmacaoTemplate,
  type EliminacaoContaInput,
} from '../templates/eliminacaoConta.ts';
import { passwordRecoveryTemplate, magicLinkTemplate, motoristaOnboardingTemplate } from '../templates/authEmail.ts';
import type { EmailAttachment, EmailMessage, EmailSendResult } from '../types/index.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// Único ponto que as Edge Functions chamam para enviar email. Não conhece
// Brevo (nem nenhum outro provider) — só orquestra: valida, identifica a
// integração da org via EmailProviderFactory, delega o envio e regista o log.
export class EmailService {
  constructor(private readonly supabase: SupabaseClient) {}

  async sendCalendarNotification(
    orgId: string,
    args: CalendarNotificationInput & { to: string }
  ): Promise<EmailSendResult> {
    if (!args.to || !args.to.includes('@')) {
      throw new EmailValidationError(`Destinatário inválido: "${args.to}"`);
    }

    const { subject, html } = calendarNotificationTemplate(args);
    const message: EmailMessage = { to: [{ email: args.to }], subject, html };

    return this.send(orgId, 'calendar_notification', message);
  }

  // orgId pode ser null: o fluxo de check-in/out por token (motorista sem
  // sessão, ver entregaOperations.ts) não tem org_id disponível no cliente —
  // é derivado aqui a partir de viaturas.org_id.
  async sendFolhaDanos(
    orgId: string | null,
    args: {
      to: string;
      toNome?: string;
      subject: string;
      pdfBase64: string;
      filename: string;
      viaturaId?: string;
    }
  ): Promise<EmailSendResult> {
    if (!args.to || !args.to.includes('@')) {
      throw new EmailValidationError(`Destinatário inválido: "${args.to}"`);
    }

    let resolvedOrgId = orgId;

    if (!resolvedOrgId && args.viaturaId) {
      const { data: viatura } = await this.supabase
        .from('viaturas')
        .select('org_id')
        .eq('id', args.viaturaId)
        .maybeSingle();
      resolvedOrgId = viatura?.org_id ?? null;
    }

    if (!resolvedOrgId) {
      throw new EmailValidationError('Não foi possível determinar a organização (org_id ou viaturaId em falta)');
    }

    const { html } = folhaDanosTemplate();
    const attachments: EmailAttachment[] = [{ content: args.pdfBase64, name: args.filename }];

    const message: EmailMessage = {
      to: [{ email: args.to, name: args.toNome }],
      subject: args.subject,
      html,
      attachments,
    };

    return this.send(resolvedOrgId, 'folha_danos', message);
  }

  async sendDocumentoFiscal(
    orgId: string,
    args: {
      to: string;
      toNome?: string;
      subject: string;
      mensagem: string;
      pdfBase64: string;
      filename: string;
    }
  ): Promise<EmailSendResult> {
    if (!args.to || !args.to.includes('@')) {
      throw new EmailValidationError(`Destinatário inválido: "${args.to}"`);
    }

    const { html } = documentoFiscalTemplate(args.mensagem);
    const attachments: EmailAttachment[] = [{ content: args.pdfBase64, name: args.filename }];

    const message: EmailMessage = {
      to: [{ email: args.to, name: args.toNome }],
      subject: args.subject,
      html,
      attachments,
    };

    return this.send(orgId, 'documento_fiscal', message);
  }

  async sendAssistanceNotification(
    orgId: string,
    args: AssistanceNotificationInput & { to: string }
  ): Promise<EmailSendResult> {
    if (!args.to || !args.to.includes('@')) {
      throw new EmailValidationError(`Destinatário inválido: "${args.to}"`);
    }

    const { subject, html } = assistanceNotificationTemplate(args);
    const message: EmailMessage = { to: [{ email: args.to }], subject, html };

    return this.send(orgId, 'assistance', message);
  }

  async sendAlertaExpiracao(
    orgId: string,
    args: AlertasExpiracoesInput & { to: string; toNome?: string }
  ): Promise<EmailSendResult> {
    if (!args.to || !args.to.includes('@')) {
      throw new EmailValidationError(`Destinatário inválido: "${args.to}"`);
    }

    const { subject, html } = alertasExpiracoesTemplate(args);
    const message: EmailMessage = { to: [{ email: args.to, name: args.toNome }], subject, html };

    return this.send(orgId, 'alerta_expiracao', message);
  }

  async sendReciboAnulado(
    orgId: string,
    args: ReciboAnuladoInput & { to: string; toNome?: string; destinatario: 'motorista' | 'gestor' }
  ): Promise<EmailSendResult> {
    if (!args.to || !args.to.includes('@')) {
      throw new EmailValidationError(`Destinatário inválido: "${args.to}"`);
    }

    const { subject, html } =
      args.destinatario === 'motorista'
        ? reciboAnuladoMotoristaTemplate(args)
        : reciboAnuladoGestorTemplate(args);
    const message: EmailMessage = { to: [{ email: args.to, name: args.toNome }], subject, html };

    return this.send(orgId, 'recibo_anulado', message);
  }

  async sendReminder(
    orgId: string,
    args: ReminderInput & { to: string; toNome?: string; ccEmail?: string | null }
  ): Promise<EmailSendResult> {
    if (!args.to || !args.to.includes('@')) {
      throw new EmailValidationError(`Destinatário inválido: "${args.to}"`);
    }

    const { subject, html } = reminderTemplate(args);
    const message: EmailMessage = {
      to: [{ email: args.to, name: args.toNome }],
      cc: args.ccEmail ? [{ email: args.ccEmail }] : undefined,
      subject,
      html,
    };

    return this.send(orgId, 'reminder', message);
  }

  async sendEliminacaoConta(
    orgId: string,
    args: EliminacaoContaInput & { to: string; toNome?: string; destinatario: 'admin' | 'confirmacao' }
  ): Promise<EmailSendResult> {
    if (!args.to || !args.to.includes('@')) {
      throw new EmailValidationError(`Destinatário inválido: "${args.to}"`);
    }

    const { subject, html } =
      args.destinatario === 'admin'
        ? eliminacaoContaAdminTemplate(args)
        : eliminacaoContaConfirmacaoTemplate(args);
    const message: EmailMessage = { to: [{ email: args.to, name: args.toNome }], subject, html };

    return this.send(orgId, 'eliminacao_conta', message);
  }

  async sendAuthEmail(
    orgId: string,
    args: { to: string; type: 'password_recovery' | 'magic_link' | 'motorista_onboarding'; actionLink: string }
  ): Promise<EmailSendResult> {
    if (!args.to || !args.to.includes('@')) {
      throw new EmailValidationError(`Destinatário inválido: "${args.to}"`);
    }

    const { subject, html } =
      args.type === 'password_recovery'
        ? passwordRecoveryTemplate(args.actionLink)
        : args.type === 'motorista_onboarding'
          ? motoristaOnboardingTemplate(args.actionLink)
          : magicLinkTemplate(args.actionLink);
    const message: EmailMessage = { to: [{ email: args.to }], subject, html };

    return this.send(orgId, 'auth', message);
  }

  private async send(
    orgId: string,
    origem: string,
    message: EmailMessage,
    // deno-lint-ignore no-explicit-any
    logExtra?: Record<string, any>
  ): Promise<EmailSendResult> {
    let result: EmailSendResult;

    try {
      const { provider, sender } = await EmailProviderFactory.getProvider(orgId, this.supabase);
      result = await provider.send({ ...message, senderOverride: message.senderOverride ?? sender });
    } catch (err) {
      if (err instanceof EmailConfigError) {
        result = { success: false, error: `config: ${err.message}` };
      } else {
        result = {
          success: false,
          error: err instanceof EmailProviderError || err instanceof Error ? err.message : 'Erro desconhecido ao enviar email',
        };
      }
    }

    await this.log(orgId, origem, message.to[0]?.email ?? '', result, logExtra);
    return result;
  }

  private async log(
    orgId: string,
    origem: string,
    email: string,
    result: EmailSendResult,
    // deno-lint-ignore no-explicit-any
    extra?: Record<string, any>
  ): Promise<void> {
    const { error } = await this.supabase.from('email_sends').insert({
      org_id: orgId,
      origem,
      email,
      status: result.success ? 'sent' : 'erro',
      last_event: result.success ? 'sent' : 'erro',
      last_event_at: new Date().toISOString(),
      brevo_message_id: result.providerMessageId ?? null,
      error_message: result.error ?? null,
      ...extra,
    });
    if (error) {
      console.error(`EmailService: falha ao gravar log de "${origem}" para ${email}:`, error.message);
    }
  }

  async sendMarketing(
    orgId: string,
    args: {
      to: string;
      toNome?: string | null;
      subject: string;
      html: string;
      tags?: string[];
      campanhaId: string;
    }
  ): Promise<EmailSendResult> {
    if (!args.to || !args.to.includes('@')) {
      throw new EmailValidationError(`Destinatário inválido: "${args.to}"`);
    }

    const message: EmailMessage = {
      to: [{ email: args.to, name: args.toNome ?? undefined }],
      subject: args.subject,
      html: args.html,
      tags: args.tags,
    };

    return this.send(orgId, 'marketing', message, {
      campanha_id: args.campanhaId,
      nome: args.toNome ?? null,
    });
  }
}
