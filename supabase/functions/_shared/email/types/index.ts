export interface EmailAttachment {
  content: string; // base64
  name: string;
}

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailSender {
  name: string;
  email: string;
  replyTo?: string;
}

export interface EmailMessage {
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  tags?: string[];
  senderOverride?: EmailSender;
}

export interface EmailSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

// Espelha plataformas_configuracao (colunas email_*). Mantido em sync manual
// com o schema — o projecto não regenera types.ts para Edge Functions Deno.
export interface EmailIntegracaoConfig {
  id: string;
  org_id: string;
  email_provider: string | null;
  email_sender_name: string | null;
  email_sender_email: string | null;
  email_reply_to: string | null;
  email_provider_config: Record<string, unknown> | null;
  ativo: boolean;
}
