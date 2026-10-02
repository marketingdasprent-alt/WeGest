import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EVENTO_VERSAO_NOVA } from '@/lib/pwaArranque';

/**
 * Aviso de versão nova. Quem regista o service worker é o main.tsx (uma vez,
 * e só na web da app); aqui só se ouve o evento que ele emite. Antes isto
 * chamava useRegisterSW, que registava o SW uma segunda vez, sem condição,
 * também na app nativa e em docs.wegest.pt.
 */
export function UpdateNotification() {
  // window.__swUpdate já definido: o evento pode ter saído antes da montagem.
  const [needRefresh, setNeedRefresh] = useState(() => !!window.__swUpdate);

  useEffect(() => {
    const aoHaverVersao = () => setNeedRefresh(true);
    window.addEventListener(EVENTO_VERSAO_NOVA, aoHaverVersao);
    return () => window.removeEventListener(EVENTO_VERSAO_NOVA, aoHaverVersao);
  }, []);

  if (!needRefresh) return null;

  return (
    // `pointer-events-auto` é obrigatório, não é decoração: enquanto um modal
    // Radix está aberto, o Radix põe `pointer-events: none` no <body>. O
    // z-[9999] punha este aviso VISÍVEL por cima do modal, mas os cliques
    // continuavam a ser ignorados — via-se o botão "Atualizar" e não havia
    // maneira de lhe carregar sem fechar primeiro o modal. O z-index resolve o
    // empilhamento; só isto resolve o clique.
    <div className="pointer-events-auto fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-3.5 shadow-xl animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">Nova versão disponível</span>
        <span className="text-xs text-muted-foreground">
          Atualize para usar as melhorias mais recentes.
        </span>
      </div>
      <Button
        size="sm"
        onClick={async () => {
          await window.__swUpdate?.();
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          window.location.reload();
        }}
        className="shrink-0 gap-1.5"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Atualizar
      </Button>
    </div>
  );
}
