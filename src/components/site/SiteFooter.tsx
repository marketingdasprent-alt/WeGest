import { Link } from 'react-router-dom';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { CONTACTO } from './content/institucionalContent';

// Dois grupos: o que ajuda a decidir, e o que é obrigação legal. Antes eram
// seis links numa fila só, com Termos ao lado de Sobre — sem hierarquia.
const EMPRESA = [
  { to: '/sobre', label: 'Sobre' },
  { to: '/faq', label: 'Perguntas frequentes' },
  { to: '/contactos', label: 'Contactos' },
];

const LEGAL = [
  { to: '/termos', label: 'Termos' },
  { to: '/privacidade', label: 'Privacidade' },
  { to: '/cookies', label: 'Cookies' },
];

const classeLink =
  'text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded';

/**
 * Rodapé, partilhado pela landing e pelas páginas institucionais.
 *
 * Não é um detalhe: a versão anterior da landing terminava num tour de 100dvh
 * que capturava o scroll, ou seja, **a página não tinha fundo**. Chegar ao fim
 * de uma página é um momento de decisão — "já vi tudo, agora escolho" — e não
 * existia.
 *
 * Os links são todos `Link` com caminho absoluto e não âncoras: este rodapé
 * aparece também em /termos e /cookies, onde um `href="#contacto"` não teria
 * destino nenhum.
 */
export const SiteFooter = () => {
  const logoSrc = useThemedLogo();
  const ano = new Date().getFullYear();

  return (
    <footer className="border-t border-border/50">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 md:grid-cols-12 lg:px-16">
        <div className="md:col-span-5">
          <img src={logoSrc} alt="WeGest" className="h-7 w-auto object-contain" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Sistema de gestão para empresas de renting, aluguer de viaturas e TVDE. Construído e
            usado em Portugal.
          </p>
          <a
            href={`mailto:${CONTACTO.email}`}
            className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {CONTACTO.email}
          </a>
        </div>

        <nav aria-label="Empresa" className="md:col-span-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
            Empresa
          </h2>
          <ul className="mt-4 space-y-3">
            {EMPRESA.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className={classeLink}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal" className="md:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
            Legal
          </h2>
          <ul className="mt-4 space-y-3">
            {LEGAL.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className={classeLink}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="md:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
            Clientes
          </h2>
          <ul className="mt-4 space-y-3">
            <li>
              <Link
                to="/entrar"
                className="rounded text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Entrar no sistema
              </Link>
            </li>
            <li>
              <Link to="/eliminar-conta" className={classeLink}>
                Eliminar conta
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl border-t border-border/40 px-6 py-6 lg:px-16">
        <p className="text-xs text-muted-foreground">
          © {ano} WeGest. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
};
