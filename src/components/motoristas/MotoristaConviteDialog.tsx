import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy, MessageCircle, Share2 } from 'lucide-react';
import { useMotoristaInviteLink } from '@/hooks/useMotoristaInviteLink';
import { useTenant } from '@/contexts/TenantContext';

interface MotoristaConviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mostra o link de registo da org ativa para o gestor o enviar ao motorista.
 * Em telemóvel oferece "Partilhar" (navigator.share), que é por onde o link
 * segue na prática — WhatsApp.
 */
export const MotoristaConviteDialog = ({ open, onOpenChange }: MotoristaConviteDialogProps) => {
  const { link, copiar } = useMotoristaInviteLink();
  const { orgId, orgs } = useTenant();
  const podePartilhar = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // WhatsApp sem número: abre a lista de conversas com a mensagem pronta, e o
  // gestor escolhe a quem manda. É como isto se usa na prática — o link é o
  // mesmo para toda a gente, não é personalizado por motorista.
  //
  // `wa.me` e não `web.whatsapp.com` de propósito: no telemóvel abre a app,
  // no computador reencaminha para o WhatsApp Web. Um link só serve os dois.
  const enviarWhatsApp = () => {
    if (!link) return;
    const empresa = orgs.find((o) => o.id === orgId)?.nome ?? 'a nossa frota';
    // Sem emojis: o texto viaja pela query string até ao WhatsApp e os
    // caracteres fora do plano básico (4 bytes em UTF-8, como 👋) chegavam
    // partidos ao destinatário. Acentos passam bem; emojis não valem o risco.
    //
    // Pede-se o NIF e não o email: é pelo NIF que a aprovação encontra a ficha
    // que o motorista já tem no sistema (ver aprovar_candidatura_motorista).
    // Dizer-lhe "usa o mesmo email que já tens connosco" era mandá-lo adivinhar
    // — a maioria não sabe qual registámos, e ao escrever outro acabava com
    // ficha duplicada. O email pode ser o que ele quiser; o NIF é que liga.
    const mensagem =
      `Olá!\n\n` +
      `Convite para te registares como motorista em *${empresa}*.\n\n` +
      `Abre este link e preenche a tua ficha:\n${link}\n\n` +
      `Podes usar o email que preferires. Preenche o NIF com atenção: é por ele que ficas ligado ao teu registo, se já trabalhaste connosco.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener');
  };

  const partilhar = async () => {
    if (!link) return;
    try {
      await navigator.share({
        title: 'Registo de motorista',
        text: 'Regista-te aqui para entrares na nossa frota:',
        url: link,
      });
    } catch {
      // O utilizador cancelou a partilha — não é erro.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar motorista</DialogTitle>
          <DialogDescription>
            Envia este link ao motorista. Ele preenche a ficha e fica associado à tua empresa.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="break-all font-mono text-sm text-primary">{link}</p>
            </div>
            <Button
              onClick={enviarWhatsApp}
              className="w-full bg-[#25D366] text-white hover:bg-[#1da851]"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Enviar convite por WhatsApp
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={copiar} className="flex-1">
                <Copy className="mr-2 h-4 w-4" />
                Copiar link
              </Button>
              {podePartilhar && (
                <Button variant="outline" onClick={partilhar} className="flex-1">
                  <Share2 className="mr-2 h-4 w-4" />
                  Partilhar
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            A organização ativa está sem código. Defina o código da empresa nas configurações.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};
