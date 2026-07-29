import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/auth/UserMenu';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SubMenuItem {
  label: string;
  url: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface MenuItem {
  label: string;
  url?: string;
  icon: React.ComponentType<{ className?: string }>;
  recurso?: string;
  requireAdmin?: boolean;
  subItems?: SubMenuItem[];
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, recurso: 'motoristas_gestao' },
  { label: 'CRM', url: '/crm', icon: BarChart3, recurso: 'motoristas_crm' },
  { label: 'Meus Tickets', url: '/meus-tickets', icon: Wrench, recurso: 'motoristas_crm' },
  {
    label: 'Motoristas',
    icon: User,
    recurso: 'motoristas_gestao',
    subItems: [
      { label: 'Motoristas', url: '/motoristas', icon: User },
      { label: 'Aprovação', url: '/motoristas/candidaturas', icon: ClipboardCheck },
      { label: 'Contratos', url: '/contratos', icon: FileText },
    ],
  },
  { label: 'Frota', url: '/viaturas', icon: Car, recurso: 'viaturas_ver' },
  { label: 'Financeiro', url: '/financeiro', icon: Wallet, recurso: 'financeiro_recibos' },
  { label: 'Assistência', url: '/assistencia', icon: Wrench, recurso: 'assistencia_tickets' },
  { label: 'Movimentações', url: '/calendario', icon: CalendarDays, recurso: 'calendario_ver' },
  { label: 'Marketing', url: '/marketing', icon: Mail, recurso: 'marketing_ver' },
];

// Admin is a single link to /admin/settings now

export const HorizontalTopMenu: React.FC = () => {
  const { isAdmin, hasAccessToResource, loading } = usePermissions();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const logoSrc = useThemedLogo();
  const location = useLocation();

  // Show all menu items immediately, even while loading
  const visibleMenuItems = MENU_ITEMS.filter((item) => {
    if (loading) return true; // Show all during load
    if (item.recurso) return hasAccessToResource(item.recurso);
    return true;
  });

  // Check if user has access to admin
  const hasAdminAccess = !loading && hasAccessToResource('admin_configuracoes');

  // Mobile version with Sheet
  if (isMobile) {
    return (
      <header className="h-20 bg-card/95 backdrop-blur-sm border-b border-primary/30 sticky top-0 z-[60]">
        <div className="h-full grid grid-cols-5 items-center px-4">
          {/* Mobile Menu Button */}
          <div className="col-span-1">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                {/* Nome acessível da gaveta. Não pode ser visível — o topo da
                    gaveta é o logótipo — por isso fica sr-only. */}
                <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
                <div className="flex flex-col h-full">
                  {/* Logo in Sheet */}
                  <div className="p-6 border-b">
                    <img src={logoSrc} alt="WeGest" className="h-10 w-auto object-contain" />
                  </div>

                  {/* Menu Items */}
                  <nav className="flex-1 py-4">
                    {visibleMenuItems.map((item) => {
                      const Icon = item.icon;

                      // Se tem subitens, renderiza grupo
                      if (item.subItems && item.subItems.length > 0) {
                        return (
                          <div key={item.label}>
                            <div className="px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span>{item.label}</span>
                            </div>
                            {item.subItems.map((subItem) => {
                              const SubIcon = subItem.icon || Icon;
                              return (
                                <NavLink
                                  key={subItem.url}
                                  to={subItem.url}
                                  onClick={(e) => {
                                    if (loading) {
                                      e.preventDefault();
                                      return false;
                                    }
                                    setIsOpen(false);
                                  }}
                                  className={({ isActive }) =>
                                    cn(
                                      'flex items-center gap-3 px-6 pl-10 py-3 transition-colors',
                                      'hover:bg-primary/10',
                                      'text-sm font-medium',
                                      loading && 'pointer-events-none opacity-50',
                                      isActive
                                        ? 'bg-primary/20 text-primary border-l-4 border-primary'
                                        : 'text-muted-foreground hover:text-foreground'
                                    )
                                  }
                                >
                                  <SubIcon className="h-4 w-4" />
                                  <span>{subItem.label}</span>
                                </NavLink>
                              );
                            })}
                          </div>
                        );
                      }

                      // Item normal sem subitens
                      return (
                        <NavLink
                          key={item.url}
                          to={item.url!}
                          onClick={(e) => {
                            if (loading) {
                              e.preventDefault();
                              return false;
                            }
                            setIsOpen(false);
                          }}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 px-6 py-4 transition-colors',
                              'hover:bg-primary/10',
                              'text-base font-medium',
                              loading && 'pointer-events-none opacity-50',
                              isActive
                                ? 'bg-primary/20 text-primary border-l-4 border-primary'
                                : 'text-muted-foreground hover:text-foreground'
                            )
                          }
                        >
                          <Icon className="h-5 w-5" />
                          <span>{item.label}</span>
                        </NavLink>
                      );
                    })}

                    {/* Admin Link */}
                    {hasAdminAccess && (
                      <NavLink
                        to="/admin/settings"
                        onClick={() => setIsOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 px-6 py-4 transition-colors mt-2',
                            'hover:bg-primary/10',
                            'text-base font-medium',
                            isActive
                              ? 'bg-primary/20 text-primary border-l-4 border-primary'
                              : 'text-muted-foreground hover:text-foreground'
                          )
                        }
                      >
                        <Settings className="h-5 w-5" />
                        <span>Administração</span>
                      </NavLink>
                    )}
                  </nav>

                  {/* User Menu at bottom */}
                  <div className="p-4 border-t flex items-center justify-between gap-2">
                    <UserMenu />
                    <ThemeToggle />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Logo and Email Centered */}
          <div className="col-span-3 flex flex-col items-center justify-center gap-0.5">
            <img src={logoSrc} alt="WeGest" className="h-8 w-auto object-contain" />
            {!loading && user && (
              <span className="text-[10px] text-muted-foreground font-medium truncate max-w-full">
                {user.user_metadata?.nome || user.email?.split('@')[0] || 'Utilizador'}
              </span>
            )}
          </div>

          {/* User & Theme Toggle Right */}
          <div className="col-span-1 flex items-center justify-end gap-1">
            <UserMenu />
          </div>
        </div>
      </header>
    );
  }

  // Desktop version (unchanged)
  return (
    <header className="h-32 bg-card/95 backdrop-blur-sm border-b border-primary/30 sticky top-0 z-[60] flex flex-col justify-center">
      <div className="h-full flex items-center justify-between px-6 max-w-[1800px] mx-auto w-full gap-8">
        {/* Logo */}
        <div className="flex-shrink-0">
          <img src={logoSrc} alt="WeGest" className="h-14 w-auto object-contain" />
        </div>

        {/* Menu Items arranged in 2 rows of 5 */}
        <nav className="grid grid-cols-5 gap-x-2 gap-y-2 flex-1 max-w-4xl">
          {[
            ...visibleMenuItems,
            ...(hasAdminAccess
              ? [{ label: 'Administração', url: '/admin/settings', icon: Settings } as MenuItem]
              : []),
          ].map((item) => {
            const Icon = item.icon;

            // Se tem subitens, renderiza dropdown
            if (item.subItems && item.subItems.length > 0) {
              const isSubActive = item.subItems.some(
                (sub) =>
                  location.pathname === sub.url || location.pathname.startsWith(sub.url + '/')
              );

              return (
                <DropdownMenu key={item.label}>
                  <DropdownMenuTrigger asChild>
                    <button
                      disabled={loading}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 w-full justify-start',
                        'hover:bg-primary/10',
                        'text-xs font-medium border-none outline-none',
                        loading && 'pointer-events-none opacity-50',
                        isSubActive
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      <ChevronDown className="h-3 w-3 ml-auto" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-48 bg-background z-[70]">
                    {item.subItems.map((subItem) => {
                      const SubIcon = subItem.icon || Icon;
                      return (
                        <DropdownMenuItem key={subItem.url} asChild>
                          <NavLink
                            to={subItem.url}
                            className="flex items-center w-full cursor-pointer"
                          >
                            <SubIcon className="mr-2 h-4 w-4" />
                            <span>{subItem.label}</span>
                          </NavLink>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

            // Item normal sem subitens
            return (
              <NavLink
                key={item.url}
                to={item.url!}
                onClick={(e) => {
                  if (loading) {
                    e.preventDefault();
                    return false;
                  }
                }}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 w-full justify-start',
                    'hover:bg-primary/10',
                    'text-xs font-medium',
                    loading && 'pointer-events-none opacity-50',
                    isActive
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Menu e Theme Toggle */}
        <div className="flex-shrink-0 flex items-center gap-4">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
};
