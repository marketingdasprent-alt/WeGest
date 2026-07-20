import type { EmailMessage, EmailSendResult } from '../types/index.ts';

// Nenhuma regra de negócio deve importar um provider concreto — só esta
// interface. Trocar de Brevo para SES/Resend/SMTP não deve exigir mudança
// nenhuma no EmailService nem nas Edge Functions que o chamam.
export interface EmailProvider {
  send(msg: EmailMessage): Promise<EmailSendResult>;
}
