import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { cn } from '@/lib/utils';
import {
  TOUR_MODULES,
  TOUR_INSTITUTIONAL_MODULES,
  CONTACT_INDEX,
  type TourModuleMeta,
} from './tourData';

interface TourSidebarProps {
  activeIndex: number;
  onSelect?: (index: number) => void;
}

const NavButton = ({
  module,
  isActive,
  onClick,
}: {
  module: TourModuleMeta;
  isActive: boolean;
  onClick: () => void;
}) => {
  const Icon = module.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm font-medium transition-colors duration-200',
        isActive ? 'text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {isActive && (
        <motion.span
          layoutId="tour-sidebar-active"
          className="absolute inset-0 rounded-lg bg-primary/15 shadow-sm"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      {isActive && (
        <motion.span
          layoutId="tour-sidebar-bar"
          className="absolute left-0 h-6 w-1 rounded-r-full bg-primary"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      <Icon
        className={cn(
          'relative z-10 h-4 w-4 shrink-0 transition-transform duration-200',
          isActive ? 'text-primary' : 'group-hover:scale-110'
        )}
      />
      <span className="relative z-10">{module.label}</span>
    </button>
  );
};

// Clone visual do sidebar real da app (src/components/navigation/SidebarMenu.tsx):
// mesmo fundo/blur/borda, mesma barra de item ativo, mesmos dois grupos
// (Navegação / Institucional, tal como "Navegação"/"Administração" na app
// real). O estado ativo aqui não vem da rota — vem do índice do tour.
export const TourSidebar = ({ activeIndex, onSelect }: TourSidebarProps) => {
  const logoSrc = useThemedLogo();

  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-border/50 bg-card/50 backdrop-blur-xl lg:flex">
      <div className="flex items-center justify-center p-4">
        <img src={logoSrc} alt="WeGest" className="h-16 w-auto object-contain" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Navegação
        </p>
        <div className="space-y-1">
          {TOUR_MODULES.map((module, index) => (
            <NavButton
              key={module.key}
              module={module}
              isActive={index === activeIndex}
              onClick={() => onSelect?.(index)}
            />
          ))}
        </div>

        <p className="px-4 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Institucional
        </p>
        <div className="space-y-1">
          {TOUR_INSTITUTIONAL_MODULES.map((module, offset) => {
            const index = TOUR_MODULES.length + offset;
            return (
              <NavButton
                key={module.key}
                module={module}
                isActive={index === activeIndex}
                onClick={() => onSelect?.(index)}
              />
            );
          })}
        </div>
      </nav>

      <div className="space-y-3 border-t border-border/50 bg-muted/30 p-4">
        <button
          type="button"
          onClick={() => onSelect?.(CONTACT_INDEX)}
          className="block w-full rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20"
        >
          Fale connosco
        </button>
        <Link
          to="/entrar"
          className="block text-center text-xs font-medium text-primary hover:text-primary/80"
        >
          Já é cliente? Entrar
        </Link>
      </div>
    </aside>
  );
};
