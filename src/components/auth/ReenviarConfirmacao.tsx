import React, { useEffect, useReducer, useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getEmailRedirectUrl } from '@/lib/native';
import { traduzirErroAuth } from '@/lib/erroAuth';
import {
  chaveDoEmail,
  foiEnviado,
  marcarEnviado,
  marcarEspera,
  segundosDeEspera,
  segundosDoLimite,
} from './reenvioConfirmacaoEstado';

interface ReenviarConfirmacaoProps {
  email: string;
}

// Pedido de novo email de confirmação. O link do primeiro vale 24 horas e,
// sem este botão, o motorista que o perdeu ficava sem saída: o registo dizia
// "já tem conta" e o login dizia "confirme o email".
export const ReenviarConfirmacao: React.FC<ReenviarConfirmacaoProps> = ({ email }) => {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  // Só serve para voltar a desenhar: a contagem lê-se do estado partilhado.
  const [, redesenhar] = useReducer((n: number) => n + 1, 0);

  const chave = chaveDoEmail(email);
  const espera = segundosDeEspera(chave, Date.now());
  const enviado = foiEnviado(chave);

  useEffect(() => {
    if (espera <= 0) return;
    const id = window.setTimeout(redesenhar, 1000);
    return () => window.clearTimeout(id);
  }, [espera]);

  const handleReenviar = async () => {
    const emailTrim = email.trim();
    if (!emailTrim) {
      toast({
        title: 'Email em falta',
        description: 'Introduza o seu email para receber o link de confirmação.',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: emailTrim,
        options: { emailRedirectTo: getEmailRedirectUrl('/motorista/login') },
      });
      if (error) throw error;

      marcarEnviado(chave, Date.now());
      toast({
        title: 'Email enviado',
        description: 'Se este email tiver uma conta por confirmar, enviámos um novo link.',
      });
    } catch (error: unknown) {
      console.error('Erro ao reenviar a confirmação:', error);
      // Pediu cedo demais: mostra a contagem que o servidor indicou.
      const segundos = segundosDoLimite(error);
      if (segundos) marcarEspera(chave, segundos, Date.now());
      toast({
        title: 'Não foi possível reenviar',
        description: traduzirErroAuth(error, 'Não foi possível enviar o email. Tente novamente.'),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
      redesenhar();
    }
  };

  return (
    <div className="space-y-2" data-testid="reenviar-confirmacao">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleReenviar}
        disabled={sending || espera > 0}
      >
        {sending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />A enviar...
          </>
        ) : espera > 0 ? (
          `Reenviar de novo em ${espera} s`
        ) : (
          'Reenviar email de confirmação'
        )}
      </Button>
      {enviado && (
        <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Verifique o email, incluindo a pasta de spam. O link novo vale 24 horas e o anterior
            deixa de servir.
          </span>
        </p>
      )}
    </div>
  );
};
