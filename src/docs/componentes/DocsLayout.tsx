import { useCallback, useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { DocLink } from './DocLink';
import { RodapePagina } from './RodapePagina';
import { BotaoPesquisa, Search } from './Search';
import { SidebarNav } from './SidebarNav';

interface Props {
  slug: string;
  children: ReactNode;
  /** Sem rodapé Anterior/Seguinte (404, estado vazio). */
  semRodape?: boolean;
}

/** Moldura do docs: topo sticky, barra lateral a partir de lg, Sheet no mobile. */
export function DocsLayout({ slug, children, semRodape = false }: Props) {
  const [menu, setMenu] = useState(false);
  const [pesquisa, setPesquisa] = useState(false);
  const mudarPesquisa = useCallback((a: boolean) => setPesquisa(a), []);

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        Saltar para o conteúdo
      </a>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
        <button
          type="button"
          aria-label="Abrir o menu"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          onClick={() => setMenu(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <DocLink para="" className="flex items-baseline gap-1.5 font-display text-lg font-semibold">
          WeGest <span className="text-primary-text">Docs</span>
        </DocLink>
        <div className="ml-auto flex items-center gap-2">
          <BotaoPesquisa abrir={() => setPesquisa(true)} />
          <a
            href="https://wegest.pt"
            className="hidden text-sm text-muted-foreground hover:text-foreground lg:inline"
          >
            Painel WeGest
          </a>
          <ThemeToggle />
        </div>
      </header>

      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navegação da documentação</SheetTitle>
          <SheetDescription className="sr-only">Guias, recursos e ferramentas.</SheetDescription>
          <ScrollArea className="h-full px-3">
            <SidebarNav actual={slug} noSheet aoEscolher={() => setMenu(false)} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
      <Search aberto={pesquisa} mudar={mudarPesquisa} />

      <div className="lg:flex">
        <aside className="hidden lg:sticky lg:top-14 lg:block lg:h-[calc(100vh-3.5rem)] lg:w-64 lg:shrink-0 lg:border-r">
          <ScrollArea className="h-full px-3">
            <SidebarNav actual={slug} />
          </ScrollArea>
        </aside>
        <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 px-4 py-8 md:px-8 lg:py-10">
          {children}
          {!semRodape && (
            <div className="max-w-3xl xl:max-w-[42rem]">
              <RodapePagina slug={slug} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
