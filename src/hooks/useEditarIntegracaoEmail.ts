import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface EditarIntegracaoEmailVars {
  id: string;
  nome: string;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  /** Só enviada quando o utilizador escolhe substituir a API Key. */
  apiKey?: string;
}

/**
 * Atualiza nome/remetente da integração Brevo e, opcionalmente, a API Key
 * (cifrada via RPC set_email_api_key — nunca gravada em texto plano).
 */
export function useEditarIntegracaoEmail() {
  return useMutation({
    mutationFn: async ({
      id,
      nome,
      senderName,
      senderEmail,
      replyTo,
      apiKey,
    }: EditarIntegracaoEmailVars) => {
      const { error } = await supabase
        .from('plataformas_configuracao')
        .update({
          nome,
          email_sender_name: senderName,
          email_sender_email: senderEmail,
          email_reply_to: replyTo || null,
        })
        .eq('id', id);
      if (error) throw error;

      if (apiKey) {
        const { error: keyError } = await supabase.rpc('set_email_api_key', {
          p_integracao_id: id,
          p_api_key: apiKey,
        });
        if (keyError) throw keyError;
      }
    },
  });
}
