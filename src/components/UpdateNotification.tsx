import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EVENTO_VERSAO_NOVA } from '@/lib/pwaArranque';

/** Se o service worker novo não assumir a página neste tempo, recarrega-se na mesma. */
export const ESPERA_SW_NOVO_MS = 5000;

/**
 * Aviso de versão nova. Quem regista o service worker é o main.tsx (uma vez,
 * e só na web da app); aqui só se ouve o evento que ele emite. Antes isto
 * chamava useRegisterSW, que registava o SW uma segunda vez, sem condição,
 * também na app nativa e em docs.wegest.pt.
 */
export function UpdateNotification() {
  // window.__swUpdate já definido: o evento pode ter saído antes da montagem.
  const [needRefresh, setNeedRefresh] = useState(() => !!window.__swUpdate);
  const [aAtualizar, setAAtualizar] = useState(false);

  useEffect(() => {
    const aoHaverVersao = () => setNeedRefresh(true);
    window.addEventListener(EVENTO_VERSAO_NOVA, aoHaverVersao);
    return () => window.removeEventListener(EVENTO_VERSAO_NOVA, aoHaverVersao);
  }, []);

  if (!needRefresh) return null;

  const atualizar = async () => {
    setAAtualizar(true);
    // __swUpdate activa o SW novo e recarrega quando ele assume a página.
    // Recarregar logo a seguir (como antes) apanhava o SW antigo: o novo
    // continuava à espera e o aviso voltava a cada página, "toda hora".
    // Não apagar caches aqui: levava o precache do SW novo (ver repararPrecache).
    window.setTimeout(() => window.location.reload(), ESPERA_SW_NOVO_MS);
    await window.__swUpdate?.();
  };

  return (
    // `pointer-events-auto` é obrigatório, não é decoração: enquanto um modal
    // Radix está aberto, o Radix põe `pointer-events: none` no <body>. O
    // z-[9999] punha este aviso VISÍVEL por cima do modal, mas os cliques
    // continuavam a ser ignorados — via-se o botão "Atualizar" e não havia
    // maneira de lhe carregar sem fechar primeiro o modal. O z-index resolve o
    // empilhamento; só isto resolve o clique.
    // `bottom-24` no telemóvel: fica acima da barra de secções do portal do
    // motorista em vez de tapar os botões do fim da página.
    <div className="pointer-events-auto fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xl animate-in slide-in-from-bottom-4 duration-300 md:bottom-5">
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">Nova versão disponível</span>
        <span className="text-xs text-muted-foreground">
          Atualize para usar as melhorias mais recentes.
        </span>
      </div>
      <Button
        size="sm"
        onClick={() => void atualizar()}
        disabled={aAtualizar}
        className="shrink-0 gap-1.5"
      >
        <RefreshCw className={aAtualizar ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
        Atualizar
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setNeedRefresh(false)}
        disabled={aAtualizar}
        className="h-8 w-8 shrink-0 text-muted-foreground"
        aria-label="Mais tarde"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
