import { useEffect, useRef } from 'react';
import {
  carregarTurnstile,
  turnstileSiteKey,
  type AcaoCaptcha,
  type TurnstileApi,
} from '@/lib/turnstile';

interface TurnstileCaptchaProps {
  /** Formulário a que o token fica preso; o servidor recusa-o noutro. */
  acao: AcaoCaptcha;
  /** Token pronto a enviar, ou null enquanto não há (ou expirou). */
  onToken: (token: string | null) => void;
}

/**
 * Verificação anti-robô dos formulários públicos. Cada token só serve uma vez:
 * depois de um envio, o formulário remonta o componente (prop `key`).
 */
export const TurnstileCaptcha = ({ acao, onToken }: TurnstileCaptchaProps) => {
  const contentor = useRef<HTMLDivElement>(null);
  const onTokenAtual = useRef(onToken);
  onTokenAtual.current = onToken;
  const siteKey = turnstileSiteKey();

  useEffect(() => {
    if (!siteKey || !contentor.current) return;
    let widget: { id: string; api: TurnstileApi } | undefined;
    let cancelado = false;
    carregarTurnstile()
      .then((turnstile) => {
        if (cancelado || !contentor.current) return;
        const id = turnstile.render(contentor.current, {
          sitekey: siteKey,
          action: acao,
          language: 'pt',
          callback: (token) => onTokenAtual.current(token),
          'expired-callback': () => onTokenAtual.current(null),
          'error-callback': () => onTokenAtual.current(null),
        });
        widget = { id, api: turnstile };
      })
      .catch((error: unknown) => {
        console.error('[TurnstileCaptcha]', error);
        onTokenAtual.current(null);
      });
    return () => {
      cancelado = true;
      widget?.api.remove(widget.id);
    };
  }, [siteKey, acao]);

  if (!siteKey) return null;
  return <div ref={contentor} className="min-h-[65px]" />;
};
