import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as Lupa } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useDocs } from '../contexto';
import { hrefDocs } from '../lib/base';
import { pagina } from '../lib/navegacao';
import { SUGESTOES, construirIndice, pesquisar } from '../lib/pesquisa';

const ehCampoDeTexto = (alvo: EventTarget | null) =>
  alvo instanceof HTMLElement &&
  (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName));

/** Pesquisa (Ctrl K / ⌘K ou "/"), ecrã inteiro no mobile. */
export function Search({ aberto, mudar }: { aberto: boolean; mudar: (a: boolean) => void }) {
  const { base } = useDocs();
  const navegar = useNavigate();
  const indice = useMemo(construirIndice, []);
  const [termo, setTermo] = useState('');
  const grupos = useMemo(() => pesquisar(indice, termo), [indice, termo]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const atalho = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
      if (atalho || (e.key === '/' && !ehCampoDeTexto(e.target))) {
        e.preventDefault();
        mudar(true);
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [mudar]);

  const ir = (destino: string) => {
    mudar(false);
    setTermo('');
    navegar(hrefDocs(base, destino));
  };

  return (
    <Dialog open={aberto} onOpenChange={mudar}>
      <DialogContent className="h-[100dvh] max-w-none gap-0 overflow-hidden p-0 sm:h-auto sm:max-w-lg">
        <DialogTitle className="sr-only">Pesquisar na documentação</DialogTitle>
        <DialogDescription className="sr-only">
          Guias, endpoints, códigos de erro e campos.
        </DialogDescription>
        <Command shouldFilter={false}>
          <CommandInput
            value={termo}
            onValueChange={setTermo}
            placeholder="Pesquisar guias, endpoints, erros…"
          />
          <CommandList className="max-h-none sm:max-h-[60vh]">
            {termo.trim() === '' ? (
              <CommandGroup heading="Sugestões">
                {SUGESTOES.map((s) => (
                  <CommandItem key={s} value={s} onSelect={() => ir(s)}>
                    {pagina(s)?.titulo}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandEmpty>
                <p>Sem resultados para «{termo}».</p>
                <button
                  type="button"
                  className="mt-2 text-primary-text underline"
                  onClick={() => ir('recursos/modelos')}
                >
                  Ver todos os recursos
                </button>
              </CommandEmpty>
            )}
            {grupos.map((g) => (
              <CommandGroup key={g.tipo} heading={g.tipo}>
                {g.entradas.map((e) => (
                  <CommandItem
                    key={`${e.tipo}-${e.destino}-${e.titulo}`}
                    value={`${e.tipo} ${e.titulo} ${e.destino}`}
                    onSelect={() => ir(e.destino)}
                  >
                    <div className="min-w-0">
                      <p className={e.tipo === 'Guias' ? '' : 'font-mono text-sm'}>{e.titulo}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.contexto}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** Botão que abre a pesquisa: ícone no mobile, campo largo com dica a partir de lg. */
export function BotaoPesquisa({ abrir }: { abrir: () => void }) {
  return (
    <button
      type="button"
      onClick={abrir}
      aria-label="Pesquisar"
      className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-64 lg:justify-between lg:border lg:px-3 lg:text-sm lg:text-muted-foreground"
    >
      <span className="flex items-center gap-2">
        <Lupa className="h-4 w-4" />
        <span className="hidden lg:inline">Pesquisar…</span>
      </span>
      <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-xs lg:inline">
        Ctrl K
      </kbd>
    </button>
  );
}
