import type { EmailProvider } from './EmailProvider.ts';
import type { EmailMessage, EmailSendResult, EmailSender } from '../types/index.ts';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const DEFAULT_SENDER: EmailSender = { name: 'WeGest', email: 'noreply@dasprent.pt' };

// Único ficheiro do projecto que sabe falar com a API da Brevo. Regra de
// negócio, EmailService e Edge Functions não conhecem este payload.
export class BrevoProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly defaultSender: EmailSender = DEFAULT_SENDER,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    const sender = msg.senderOverride ?? this.defaultSender;

    let response: Response;
    try {
      response = await this.fetchImpl(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: sender.name, email: sender.email },
          replyTo: sender.replyTo ? { email: sender.replyTo } : undefined,
          to: msg.to,
          cc: msg.cc,
          subject: msg.subject,
          htmlContent: msg.html,
          attachment: msg.attachments,
          tags: msg.tags,
        }),
      });
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Falha de rede ao contactar a Brevo' };
    }

    const data = await response.json().catch(() => ({}) as Record<string, unknown>);

    if (!response.ok) {
      const message = typeof data.message === 'string' ? data.message : `Brevo HTTP ${response.status}`;
      return { success: false, error: message };
    }

    return { success: true, providerMessageId: typeof data.messageId === 'string' ? data.messageId : undefined };
  }
}
