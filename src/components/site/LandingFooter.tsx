import { Link } from 'react-router-dom';

const LINKS = [
  { label: 'Sobre', to: '/sobre' },
  { label: 'Contactos', to: '/contactos' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Termos', to: '/termos' },
  { label: 'Privacidade', to: '/privacidade' },
];

export const LandingFooter = () => {
  return (
    <footer className="relative flex flex-col items-center gap-4 border-t border-border/30 px-6 py-10 text-sm text-muted-foreground">
      <nav className="flex flex-wrap justify-center gap-4">
        {LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="hover:text-foreground">
            {link.label}
          </Link>
        ))}
      </nav>
      <Link to="/entrar" className="font-medium text-primary hover:text-primary/80">
        Já é cliente? Entrar
      </Link>
      <p className="text-xs text-muted-foreground/70">© {new Date().getFullYear()} WeGest</p>
    </footer>
  );
};
