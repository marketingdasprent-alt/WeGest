import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const LINKS = [
  { href: '#sistema', label: 'O sistema' },
  { href: '#automacoes', label: 'Automações' },
  { href: '#objecoes', label: 'Perguntas' },
];

interface SiteNavProps {
  onCtaClick: () => void;
}

/**
 * Barra fina que só aparece depois de o hero sair do ecrã.
 *
 * Existe por uma razão de conversão: na versão anterior, um visitante
 * convencido a meio da página não tinha como agir sem voltar ao topo ou
 * encontrar a sidebar. Um CTA permanente recupera essas decisões.
 *
 * Aparece só depois do hero porque no topo já existem dois CTA — repeti-los
 * acima deles competiria com o H1.
 */
export const SiteNav = ({ onCtaClick }: SiteNavProps) => {
  const [visivel, setVisivel] = useState(false);
  const logoSrc = useThemedLogo();

  useEffect(() => {
    // Limiar em vh e não em px: acompanha a altura real do hero em qualquer ecrã.
    const handleScroll = () => setVisivel(window.scrollY > window.innerHeight * 0.6);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-40 border-b border-border/50 bg-background/85 backdrop-blur-md transition-transform duration-300',
        visivel ? 'translate-y-0' : 'invisible -translate-y-full'
      )}
      // `invisible` (visibility: hidden) e não só o translate: retira os filhos
      // da ordem de tabulação de forma nativa. Pôr `aria-hidden` com
      // descendentes focáveis — o ThemeToggle, cujo tabIndex não controlamos —
      // deixaria um foco invisível a apanhar teclado fora de ecrã.
      aria-hidden={!visivel}
    >
      <nav
        aria-label="Navegação do site"
        className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6 lg:px-16"
      >
        <a href="#topo" className="shrink-0 rounded focus-visible:ring-2 focus-visible:ring-ring">
          <img src={logoSrc} alt="WeGest" className="h-6 w-auto object-contain" />
        </a>

        <div className="hidden items-center gap-6 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <Link
            to="/entrar"
            className="hidden text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:block"
          >
            Entrar
          </Link>
          <button
            type="button"
            onClick={onCtaClick}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Falar connosco
          </button>
        </div>
      </nav>
    </div>
  );
};
