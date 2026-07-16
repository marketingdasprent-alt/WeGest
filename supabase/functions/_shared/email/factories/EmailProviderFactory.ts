import type { EmailProvider } from '../providers/EmailProvider.ts';
import { BrevoProvider } from '../providers/BrevoProvider.ts';
import { EmailConfigError } from '../errors/index.ts';
import type { EmailIntegracaoConfig, EmailSender } from '../types/index.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface ResolvedEmailProvider {
  provider: EmailProvider;
  sender: EmailSender;
}

// Único ponto do sistema que decide QUAL provider usar para uma organização.
// Regra de negócio e EmailService nunca instanciam BrevoProvider directamente
// — só chamam getProvider() e recebem de volta a interface genérica.
export class EmailProviderFactory {
  static async getProvider(orgId: string, supabase: SupabaseClient): Promise<ResolvedEmailProvider> {
    const { data: config, error } = await supabase
      .from('plataformas_configuracao')
      .select(
        'id, org_id, email_provider, email_sender_name, email_sender_email, email_reply_to, email_provider_config, ativo'
      )
      .eq('org_id', orgId)
      .eq('plataforma', 'email')
      .eq('ativo', true)
      .maybeSingle();

    if (error) {
      throw new EmailConfigError(`Erro ao ler integração de email da org: ${error.message}`);
    }

    if (!config) {
      return this.getLegacyFallback();
    }

    return this.instantiate(config as EmailIntegracaoConfig, supabase);
  }

  private static async instantiate(
    config: EmailIntegracaoConfig,
    supabase: SupabaseClient
  ): Promise<ResolvedEmailProvider> {
    const sender: EmailSender = {
      name: config.email_sender_name || 'WeGest',
      email: config.email_sender_email || 'noreply@dasprent.pt',
      replyTo: config.email_reply_to || undefined,
    };

    switch (config.email_provider) {
      case 'brevo': {
        const { data: apiKey, error } = await supabase.rpc('get_email_api_key', {
          p_integracao_id: config.id,
        });
        if (error || !apiKey) {
          throw new EmailConfigError('Integração Brevo sem API key configurada/decifrável');
        }
        return { provider: new BrevoProvider(apiKey, sender), sender };
      }
      // Providers futuros — adicionar aqui SEM tocar em EmailService nem
      // nas Edge Functions que consomem sendX():
      //   case 'ses':    return { provider: new AmazonSESProvider(config.email_provider_config), sender };
      //   case 'resend': return { provider: new ResendProvider(...), sender };
      //   case 'smtp':   return { provider: new SMTPProvider(config.email_provider_config), sender };
      default:
        throw new EmailConfigError(`email_provider desconhecido: ${config.email_provider}`);
    }
  }

  // Rede de segurança TEMPORÁRIA da migração incremental: enquanto uma org
  // ainda não tem linha própria em plataformas_configuracao (plataforma='email'),
  // cai para o BREVO_API_KEY global histórico. Isto NÃO é a arquitectura alvo
  // (o WeGest deixa de ser responsável por fornecer o envio) — remover assim
  // que todas as orgs activas tiverem a sua própria integração configurada.
  private static getLegacyFallback(): ResolvedEmailProvider {
    const legacyKey = Deno.env.get('BREVO_API_KEY');
    if (!legacyKey) {
      throw new EmailConfigError('Nenhuma integração de email configurada para esta organização');
    }
    const sender: EmailSender = { name: 'WeGest', email: 'noreply@dasprent.pt' };
    return { provider: new BrevoProvider(legacyKey, sender), sender };
  }
}
