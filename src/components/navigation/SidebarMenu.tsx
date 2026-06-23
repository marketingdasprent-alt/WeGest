import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  User,
  FileText,
  Settings,
  Menu,
  ClipboardCheck,
  ChevronDown,
  Wrench,
  Car,
  Wallet,
  CalendarDays,
  Mail,
  KeyRound,
  CalendarCheck,
  ArrowRightLeft,
  Users,
  Layers,
  Tag,
  ShieldCheck,
  PackagePlus,
  Percent,
  Fuel,
  CarFront,
  Calculator,
  CreditCard,
  Wifi,
  Banknote,
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/auth/UserMenu';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { OrgSelector } from '@/components/OrgSelector';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SubSubMenuItem {
  label: string;
  url: string;
  icon?: React.ComponentType<{ className?: string }>;
  recurso?: string;
}

interface SubMenuItem {
  label: string;
  url?: string;
  icon?: React.ComponentType<{ className?: string }>;
  recurso?: string;
  subItems?: SubSubMenuItem[];
}

interface MenuItem {
  label: string;
  url?: string;
  icon: React.ComponentType<{ className?: string }>;
  recurso?: string;
  /** Mostra o item se o utilizador tiver QUALQUER um destes recursos. */
  recursosAny?: string[];
  requireAdmin?: boolean;
  subItems?: SubMenuItem[];
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, recurso: 'motoristas_gestao' },
  {
    label: 'Renting',
    icon: KeyRound,
    subItems: [
      {
        label: 'Contratos',
        url: '/renting/contratos',
        icon: FileText,
        recurso: 'renting_contratos',
      },
      {
        label: 'Reservas',
        url: '/renting/reservas',
        icon: CalendarCheck,
        recurso: 'renting_reservas',
      },
      {
        label: 'Movimentações',
        url: '/renting/movimentacoes',
        icon: ArrowRightLeft,
        recurso: 'renting_movimentacoes',
      },
      {
        label: 'Clientes',
        url: '/renting/clientes',
        icon: Users,
        recurso: 'renting_clientes',
      },
      {
        label: 'Tarifas',
        icon: Tag,
        recurso: 'renting_contratos',
        subItems: [
          { label: 'Tarifas', url: '/renting/tarifas', icon: Tag, recurso: 'renting_contratos' },
          {
            label: 'Coberturas',
            url: '/renting/tarifas/coberturas',
            icon: ShieldCheck,
            recurso: 'renting_contratos',
          },
          {
            label: 'Extras',
            url: '/renting/tarifas/extras',
            icon: PackagePlus,
            recurso: 'renting_contratos',
          },
          {
            label: 'Taxas',
            url: '/renting/tarifas/taxas',
            icon: Percent,
            recurso: 'renting_contratos',
          },
        ],
      },
    ],
  },
  { label: 'CRM', url: '/crm', icon: BarChart3, recurso: 'motoristas_crm' },
  { label: 'Meus Tickets', url: '/meus-tickets', icon: Wrench, recurso: 'motoristas_crm' },
  {
    label: 'Motoristas',
    icon: User,
    recurso: 'motoristas_gestao',
    subItems: [
      { label: 'Todos Motoristas', url: '/motoristas', icon: User },
      { label: 'Aprovação', url: '/motoristas/candidaturas', icon: ClipboardCheck },
      { label: 'Contratos', url: '/contratos', icon: FileText },
    ],
  },
  {
    label: 'Frota',
    icon: Car,
    recurso: 'viaturas_ver',
    subItems: [
      { label: 'Viaturas', url: '/viaturas', icon: Car },
      { label: 'Grupos', url: '/viaturas/grupos', icon: Layers },
      { label: 'Marcas / Modelos', url: '/viaturas/marcas-modelos', icon: CarFront },
      { label: 'Combustíveis', url: '/viaturas/combustiveis', icon: Fuel },
      { label: 'Tipos', url: '/viaturas/tipos', icon: Tag },
    ],
  },
  {
    label: 'Administrativo',
    icon: Wallet,
    // Mostra com QUALQUER permissão do módulo Administrativo (igual ao AppSidebar).
    recursosAny: [
      'financeiro_recibos',
      'recibos_verdes_adicionar',
      'administrativo_resumos',
      'administrativo_importar',
      'administrativo_plataformas',
      'administrativo_cartoes',
    ],
    subItems: [
      { label: 'Resumos', url: '/administrativo', icon: Calculator, recurso: 'administrativo_resumos' },
      { label: 'Faturação', url: '/administrativo/faturacao', icon: Banknote, recurso: 'financeiro_recibos' },
      { label: 'Cartões Frota', url: '/administrativo/cartoes', icon: CreditCard, recurso: 'administrativo_cartoes' },
      { label: 'Dispositivos OBE', url: '/administrativo/obe', icon: Wifi, recurso: 'administrativo_cartoes' },
    ],
  },
  { label: 'Assistência', url: '/assistencia', icon: Wrench, recurso: 'assistencia_tickets' },
  { label: 'Calendário', url: '/calendario', icon: CalendarDays, recurso: 'calendario_ver' },
  { label: 'Marketing', url: '/marketing', icon: Mail, recurso: 'marketing_ver' },
];

export const SidebarMenu: React.FC = () => {
  const { isAdmin, hasAccessToResource, loading } = usePermissions();
  const { user } = useAuth();
  const userName = user?.user_metadata?.nome || user?.email?.split('@')[0] || 'Utilizador';
  const userRole = isAdmin ? 'Administrador' : 'Utilizador';
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const logoSrc = useThemedLogo();
  const location = useLocation();

  const visibleMenuItems = MENU_ITEMS.map((item) => {
    if (loading) return item;
    if (!item.subItems) return item;
    const filteredSubs = item.subItems
      .map((sub) => {
        if (!sub.subItems) return sub;
        const filteredSubSubs = sub.subItems.filter(
          (ss) => !ss.recurso || hasAccessToResource(ss.recurso)
        );
        return { ...sub, subItems: filteredSubSubs };
      })
      .filter((sub) => {
        if (sub.recurso && !hasAccessToResource(sub.recurso)) return false;
        if (sub.subItems && sub.subItems.length === 0) return false;
        return true;
      });
    return { ...item, subItems: filteredSubs };
  }).filter((item) => {
    if (loading) return true;
    if (item.recurso && !hasAccessToResource(item.recurso)) return false;
    if (
      item.recursosAny &&
      item.recursosAny.length > 0 &&
      !item.recursosAny.some((r) => hasAccessToResource(r))
    )
      return false;
    if (item.subItems && item.subItems.length === 0) return false;
    return true;
  });

  const hasAdminAccess = !loading && (isAdmin || hasAccessToResource('admin_configuracoes'));

  const NavItem = ({
    item,
    isSub = false,
    siblings = [],
  }: {
    item: MenuItem | SubMenuItem;
    isSub?: boolean;
    siblings?: (SubMenuItem | SubSubMenuItem)[];
  }) => {
    const Icon = item.icon!;
    // If a sibling URL starts with this item's URL + '/', use exact match to avoid false highlights
    const hasChildPaths = siblings.some(
      (s) => s.url && s.url !== item.url && item.url && s.url.startsWith(item.url + '/')
    );
    const isActive = hasChildPaths
      ? location.pathname === item.url
      : location.pathname === item.url ||
        (item.url !== '/' && location.pathname.startsWith(item.url! + '/'));

    return (
      <NavLink
        to={item.url!}
        end={hasChildPaths}
        onClick={() => isMobile && setIsOpen(false)}
        className={() =>
          cn(
            'flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group relative',
            isSub ? 'ml-9 text-sm' : 'text-sm font-medium',
            isActive
              ? 'bg-primary/15 text-primary shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )
        }
      >
        {isActive && !isSub && (
          <div className="absolute left-0 w-1 h-6 bg-primary rounded-r-full" />
        )}
        <Icon
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-200',
            isActive ? 'text-primary' : 'group-hover:scale-110'
          )}
        />
        <span>{item.label}</span>
      </NavLink>
    );
  };

  const MobileMenu = () => (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <header className="native-header h-16 bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-[40] lg:hidden flex items-center px-4 w-full">
          <Button variant="ghost" size="icon" className="mr-4">
            <Menu className="h-6 w-6" />
          </Button>
          <NavLink
            to="/dashboard"
            aria-label="Ir para a Dashboard"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={logoSrc} alt="Logo" className="h-8 w-auto cursor-pointer" />
          </NavLink>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 border-r border-border/50">
        <SidebarContent />
      </SheetContent>
    </Sheet>
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-card/50 backdrop-blur-xl border-r border-border/50">
      {/* Header with Logo */}
      <div className="p-4 mb-0">
        <div className="flex items-center justify-center w-full py-1">
          <NavLink to="/dashboard" aria-label="Ir para a Dashboard">
            <img
              src={logoSrc}
              alt="Logo"
              className="h-20 w-auto object-contain cursor-pointer transition-opacity hover:opacity-80"
            />
          </NavLink>
        </div>
        <OrgSelector className="w-full mt-2 justify-center" />
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="space-y-1 py-4">
          {visibleMenuItems.map((item) => {
            if (item.subItems && item.subItems.length > 0) {
              const isSubActive = item.subItems.some((sub) =>
                sub.url
                  ? location.pathname.startsWith(sub.url)
                  : (sub.subItems?.some((ss) => location.pathname.startsWith(ss.url)) ?? false)
              );
              return (
                <Collapsible key={item.label} defaultOpen={isSubActive}>
                  <CollapsibleTrigger asChild>
                    <button
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 w-full group text-sm font-medium',
                        '[&[data-state=open]>svg.chevron]:rotate-0',
                        isSubActive
                          ? 'text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          isSubActive ? 'text-primary' : 'group-hover:scale-110'
                        )}
                      />
                      <span>{item.label}</span>
                      <ChevronDown className="chevron h-3 w-3 ml-auto -rotate-90 transition-transform duration-200" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1 pt-1">
                    {item.subItems.map((sub) => {
                      // Sub-submenu (3o nível)
                      if (sub.subItems && sub.subItems.length > 0) {
                        const SubIcon = sub.icon;
                        const isNestedActive = sub.subItems.some((ss) =>
                          location.pathname.startsWith(ss.url)
                        );
                        return (
                          <Collapsible key={sub.label} defaultOpen={isNestedActive}>
                            <CollapsibleTrigger asChild>
                              <button
                                className={cn(
                                  'flex items-center gap-3 ml-9 px-3 py-2 rounded-lg transition-all duration-200 w-[calc(100%-2.25rem)] group text-sm',
                                  '[&[data-state=open]>svg.chevron]:rotate-0',
                                  isNestedActive
                                    ? 'text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                              >
                                {SubIcon && (
                                  <SubIcon
                                    className={cn(
                                      'h-3.5 w-3.5 shrink-0',
                                      isNestedActive && 'text-primary'
                                    )}
                                  />
                                )}
                                <span>{sub.label}</span>
                                <ChevronDown className="chevron h-3 w-3 ml-auto -rotate-90 transition-transform duration-200" />
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-0.5 pt-0.5">
                              {sub.subItems.map((ss) => {
                                const SsIcon = ss.icon;
                                // Se há outro item no mesmo grupo cujo url começa com este + '/', usar só match exacto
                                const hasChildPaths = sub.subItems!.some(
                                  (other) =>
                                    other.url !== ss.url && other.url.startsWith(ss.url + '/')
                                );
                                const ssActive = hasChildPaths
                                  ? location.pathname === ss.url
                                  : location.pathname === ss.url ||
                                    location.pathname.startsWith(ss.url + '/');
                                return (
                                  <NavLink
                                    key={ss.url}
                                    to={ss.url}
                                    end
                                    onClick={() => isMobile && setIsOpen(false)}
                                    className={cn(
                                      'flex items-center gap-2.5 ml-[4.5rem] px-3 py-1.5 rounded-md transition-all duration-200 text-xs',
                                      ssActive
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    )}
                                  >
                                    {SsIcon && (
                                      <SsIcon
                                        className={cn(
                                          'h-3 w-3 shrink-0',
                                          ssActive && 'text-primary'
                                        )}
                                      />
                                    )}
                                    <span>{ss.label}</span>
                                  </NavLink>
                                );
                              })}
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      }
                      return (
                        <NavItem
                          key={sub.url || sub.label}
                          item={sub}
                          isSub
                          siblings={item.subItems}
                        />
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              );
            }
            return <NavItem key={item.label} item={item} />;
          })}
          {hasAdminAccess && (
            <NavItem item={{ label: 'Administração', url: '/admin/settings', icon: Settings }} />
          )}
        </div>
      </ScrollArea>

      {/* User Footer */}
      <div className="p-4 border-t border-border/50 bg-muted/30">
        <div className="flex items-center w-full bg-background/50 p-2 rounded-xl border border-border/50 overflow-hidden">
          <UserMenu />
        </div>
      </div>
    </div>
  );

  if (isMobile) return <MobileMenu />;

  return (
    <aside className="hidden lg:block w-64 h-screen sticky top-0 overflow-hidden">
      <SidebarContent />
    </aside>
  );
};
