import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { BackgroundField } from '../BackgroundField';
import { SiteFooter } from '../SiteFooter';

/**
 * Cabeçalho das páginas institucionais.
 *
 * Não reutiliza o `SiteNav` da landing de propósito: o SiteNav aparece com o
 * scroll e navega âncoras que só existem na home. Aqui a barra está sempre
 * visível e tem uma só função — voltar ao site — porque quem chega a estas
 * páginas vem de um link e precisa de caminho de regresso.
 */
const CabecalhoInstitucional = () => {
  const logoSrc = useThemedLogo();

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-4 px-6">
        <Link
          to="/"
          className="group inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft
            aria-hidden="true"
            className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
          />
          Voltar
        </Link>

        <Link
          to="/"
          aria-label="WeGest — página inicial"
          className="mx-auto rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img src={logoSrc} alt="WeGest" className="h-6 w-auto object-contain" />
        </Link>

        <ThemeToggle />
      </div>
    </header>
  );
};

interface PaginaInstitucionalProps {
  /** Etiqueta curta acima do H1 — diz ao visitante onde está. */
  etiqueta: string;
  titulo: string;
  /** Uma linha sob o título. Opcional: as páginas legais usam-na para a data. */
  descricao?: ReactNode;
  children: ReactNode;
}

/**
 * Casca comum das páginas institucionais (Sobre, FAQ, Contactos, Termos,
 * Privacidade, Cookies, Eliminar conta).
 *
 * Existe para que estas páginas deixem de ser um site à parte: antes tinham
 * `bg-black text-white` e cores fixas (#B20101, #E53333, gray-800) que
 * ignoravam os tokens e partiam o modo claro. Agora partilham fundo,
 * tipografia, ritmo e rodapé com a landing — e herdam o tema automaticamente.
 *
 * Largura `max-w-4xl` e não `max-w-6xl` como a landing: texto corrido lê-se
 * mal em colunas largas, e estas páginas são quase todas texto.
 */
export const PaginaInstitucional = ({
  etiqueta,
  titulo,
  descricao,
  children,
}: PaginaInstitucionalProps) => (
  <div className="relative min-h-screen bg-background font-body text-foreground">
    <BackgroundField />
    <CabecalhoInstitucional />

    <main className="mx-auto w-full max-w-4xl px-6 pb-20 pt-14 md:pt-20">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{etiqueta}</p>
      <h1 className="mt-4 font-display text-balance text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">
        {titulo}
      </h1>
      {descricao && (
        <div className="mt-5 max-w-2xl text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground">
          {descricao}
        </div>
      )}

      <div className="mt-14">{children}</div>
    </main>

    <SiteFooter />
  </div>
);
