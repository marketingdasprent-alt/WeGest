import React, { useState, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Settings, Menu, ChevronDown, Search } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { UserMenu } from '@/components/auth/UserMenu';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { NotificationBell } from '@/components/notificacoes/NotificationBell';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { OrgSelector } from '@/components/OrgSelector';
import { useTenant } from '@/contexts/TenantContext';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CommandMenu } from '@/components/ui/command-menu';
import { CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';
import { useGlobalSearch, ENTITY_CONFIG, type SearchResult } from '@/hooks/useGlobalSearch';
import {
  MENU_ITEMS,
  type MenuItem,
  type SubMenuItem,
  type SubSubMenuItem,
} from './sidebarMenuItems';

export const SidebarMenu: React.FC = () => {
  const { isAdmin, hasAccessToResource, cargo, loading } = usePermissions();
  const isSupervisorTvde = isAdmin || cargo === 'Supervisor Gestor TVDE';
  const { orgId } = useTenant();
  const { user } = useAuth();
  const userName = user?.user_metadata?.nome || user?.email?.split('@')[0] || 'Utilizador';
  const userRole = isAdmin ? 'Administrador' : 'Utilizador';
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { data: searchResults } = useGlobalSearch({ term: searchTerm, enabled: commandOpen });
  const logoSrc = useThemedLogo();
  const location = useLocation();
  const navigate = useNavigate();

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
        if (sub.requireSupervisorTvde && !isSupervisorTvde) return false;
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
    if (item.orgIds && (!orgId || !item.orgIds.includes(orgId))) return false;
    if (item.subItems && item.subItems.length === 0) return false;
    return true;
  });

  const hasAdminAccess = !loading && (isAdmin || hasAccessToResource('admin_configuracoes'));

  // Pesquisa global (Cmd+K): achata visibleMenuItems (já filtrado por
  // permissão/org) até às folhas com url — 3 níveis (item > subItem >
  // subSubItem) — sem duplicar a lista de navegação num sítio novo.
  const commandItems = useMemo(() => {
    const flat: {
      label: string;
      url: string;
      icon?: React.ComponentType<{ className?: string }>;
    }[] = [];
    for (const item of visibleMenuItems) {
      if (!item.subItems?.length) {
        if (item.url) flat.push({ label: item.label, url: item.url, icon: item.icon });
        continue;
      }
      for (const sub of item.subItems) {
        if (sub.subItems?.length) {
          for (const ss of sub.subItems) {
            flat.push({ label: `${sub.label} · ${ss.label}`, url: ss.url, icon: ss.icon });
          }
        } else if (sub.url) {
          flat.push({ label: sub.label, url: sub.url, icon: sub.icon });
        }
      }
    }
    if (hasAdminAccess) {
      flat.push({ label: 'Definições', url: '/admin/settings', icon: Settings });
    }
    return flat;
  }, [visibleMenuItems, hasAdminAccess]);

  const goTo = (url: string) => {
    setCommandOpen(false);
    navigate(url);
  };

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
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Pesquisar (Cmd+K)"
              onClick={(e) => {
                e.stopPropagation();
                setCommandOpen(true);
              }}
            >
              <Search className="h-5 w-5" />
            </Button>
            {/* O <header> inteiro é o SheetTrigger (tocar em qualquer sítio abre
                a gaveta). O logo e a pesquisa acima já se excluem com
                stopPropagation, mas estes três são componentes e não o podiam
                fazer por si: tocar no sino abria o menu de navegação em vez do
                painel de notificações, e o mesmo acontecia ao tema e ao menu de
                utilizador. Excluir o grupo todo aqui resolve os três de uma vez
                e mantém o padrão já usado pelos irmãos. */}
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
              role="presentation"
            >
              <NotificationBell />
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 border-r border-border/50">
        {/* Nome acessível da gaveta. Não pode ser visível — o topo da gaveta é
            o logótipo — por isso fica sr-only. */}
        <SheetTitle className="sr-only">Menu principal</SheetTitle>
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
            <NavItem item={{ label: 'Definições', url: '/admin/settings', icon: Settings }} />
          )}
        </div>
      </ScrollArea>

      {/* User Footer */}
      <div className="p-4 border-t border-border/50 bg-muted/30">
        <div className="flex items-center gap-1 w-full bg-background/50 p-2 rounded-xl border border-border/50 overflow-hidden">
          <div className="flex-1 min-w-0">
            <UserMenu />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Pesquisar (Cmd+K)"
            onClick={() => setCommandOpen(true)}
          >
            <Search className="h-4 w-4" />
          </Button>
          <NotificationBell />
        </div>
      </div>
    </div>
  );

  const GlobalCommandMenu = () => (
    <CommandMenu
      open={commandOpen}
      onOpenChange={(next) => {
        setCommandOpen(next);
        if (!next) setSearchTerm('');
      }}
      placeholder="Pesquisar ou saltar para..."
      onSearchChange={setSearchTerm}
    >
      {searchResults &&
        (Object.keys(ENTITY_CONFIG) as (keyof typeof ENTITY_CONFIG)[]).map((entity) => {
          const results: SearchResult[] = searchResults[entity];
          if (results.length === 0) return null;
          return (
            <CommandGroup key={entity} heading={ENTITY_CONFIG[entity].heading}>
              {results.map((result) => (
                <CommandItem key={result.id} onSelect={() => goTo(result.href)}>
                  <Search className="mr-2 h-4 w-4" />
                  <span>{result.label}</span>
                  {result.subtitle && (
                    <span className="ml-2 text-xs text-muted-foreground">{result.subtitle}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      {searchResults && searchTerm.trim().length >= 2 && <CommandSeparator />}
      <CommandGroup heading="Navegar">
        {commandItems.map((item) => {
          const Icon = item.icon || Search;
          return (
            <CommandItem key={item.url} onSelect={() => goTo(item.url)}>
              <Icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          );
        })}
      </CommandGroup>
    </CommandMenu>
  );

  if (isMobile) {
    return (
      <>
        <MobileMenu />
        <GlobalCommandMenu />
      </>
    );
  }

  return (
    <>
      <aside className="hidden lg:block w-64 h-screen sticky top-0 overflow-hidden">
        <SidebarContent />
      </aside>
      <GlobalCommandMenu />
    </>
  );
};
