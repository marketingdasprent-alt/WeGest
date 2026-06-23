import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Users,
  User,
  FormInput,
  UserPlus,
  Shield,
  FileText,
  FileSignature,
  ClipboardCheck,
  ChevronDown,
  Wrench,
  Car,
  Briefcase,
  CalendarDays,
  LayoutDashboard,
  CreditCard,
  Wifi,
  Calculator,
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface SubItem {
  title: string;
  url: string;
  icon?: any;
  recurso?: string;
}

interface MenuItem {
  title: string;
  url?: string;
  icon: any;
  recurso?: string;
  recursosAny?: string[];
  subItems?: SubItem[];
}

const items: MenuItem[] = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: LayoutDashboard,
    recurso: RECURSOS.MOTORISTAS_GESTAO,
  },
  { title: 'CRM', url: '/crm', icon: BarChart3, recurso: RECURSOS.MOTORISTAS_CRM },
  { title: 'Meus Tickets', url: '/meus-tickets', icon: Wrench, recurso: RECURSOS.MOTORISTAS_CRM },
  { title: 'Contatos', url: '/contatos', icon: Users, recurso: RECURSOS.MOTORISTAS_CONTACTOS },
  {
    title: 'Motoristas',
    icon: User,
    recurso: RECURSOS.MOTORISTAS_GESTAO,
    subItems: [
      { title: 'Motoristas', url: '/motoristas', icon: User },
      { title: 'Aprovação', url: '/motoristas/candidaturas', icon: ClipboardCheck },
      { title: 'Contratos', url: '/contratos', icon: FileSignature },
    ],
  },
  { title: 'Frota', url: '/viaturas', icon: Car, recurso: RECURSOS.VIATURAS_VER },
  {
    title: 'Administrativo',
    icon: Briefcase,
    // Mostra com QUALQUER permissão do módulo Administrativo.
    recursosAny: [
      RECURSOS.FINANCEIRO_RECIBOS,
      RECURSOS.RECIBOS_VERDES_ADICIONAR,
      RECURSOS.ADMINISTRATIVO_RESUMOS,
      RECURSOS.ADMINISTRATIVO_IMPORTAR,
      RECURSOS.ADMINISTRATIVO_PLATAFORMAS,
      RECURSOS.ADMINISTRATIVO_CARTOES,
    ],
    subItems: [
      { title: 'Resumos', url: '/administrativo', icon: Calculator },
      {
        title: 'Cartões Frota',
        url: '/administrativo/cartoes',
        icon: CreditCard,
        recurso: RECURSOS.ADMINISTRATIVO_CARTOES,
      },
      {
        title: 'Dispositivos OBE',
        url: '/administrativo/obe',
        icon: Wifi,
        recurso: RECURSOS.ADMINISTRATIVO_CARTOES,
      },
    ],
  },
  {
    title: 'Movimentações',
    url: '/calendario',
    icon: CalendarDays,
    recurso: RECURSOS.CALENDARIO_VER,
  },
  {
    title: 'Assistência',
    url: '/assistencia',
    icon: Wrench,
    recurso: RECURSOS.ASSISTENCIA_TICKETS,
  },
];

const adminItems = [
  {
    title: 'Documentos',
    url: '/admin/documentos',
    icon: FileText,
    recurso: RECURSOS.ADMIN_DOCUMENTOS,
  },
  {
    title: 'Formulários',
    url: '/formularios',
    icon: FormInput,
    recurso: RECURSOS.ADMIN_FORMULARIOS,
  },
  {
    title: 'Convites',
    url: '/admin/invites',
    icon: UserPlus,
    recurso: RECURSOS.ADMIN_UTILIZADORES,
  },
  {
    title: 'Configurações',
    url: '/admin/settings',
    icon: Shield,
    recurso: RECURSOS.ADMIN_CONFIGURACOES,
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { isAdmin, hasAccessToResource } = usePermissions();

  // Acesso a um item: por um recurso único OU por QUALQUER recurso de uma lista (recursosAny).
  const canAccessItem = (item: { recurso?: string; recursosAny?: string[] }) =>
    (!!item.recurso && hasAccessToResource(item.recurso)) ||
    (Array.isArray(item.recursosAny) && item.recursosAny.some((r) => hasAccessToResource(r)));

  // Filtrar itens baseado em permissões
  const visibleItems = items.filter(canAccessItem);
  // CRÍTICO: Filtrar adminItems por permissão, não por isAdmin
  const visibleAdminItems = adminItems.filter((item) => hasAccessToResource(item.recurso));

  // Se não tem itens visíveis E não tem itens de admin, mostrar mensagem
  if (visibleItems.length === 0 && visibleAdminItems.length === 0) {
    return (
      <Sidebar collapsible="icon">
        <SidebarContent>
          <div className="p-4 text-sm text-muted-foreground">Sem permissões atribuídas</div>
        </SidebarContent>
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Seção Principal - APENAS itens com permissão */}
        {visibleItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Navegação</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleItems.map((item) => {
                  // Se tem subitens, renderiza collapsible
                  if (item.subItems && item.subItems.length > 0) {
                    // Subitens podem exigir o seu próprio recurso.
                    const subItems = item.subItems.filter(
                      (sub: { recurso?: string }) =>
                        !sub.recurso || hasAccessToResource(sub.recurso)
                    );
                    if (subItems.length === 0) return null;
                    const isSubActive = subItems.some(
                      (sub) =>
                        location.pathname === sub.url || location.pathname.startsWith(sub.url + '/')
                    );

                    return (
                      <Collapsible
                        key={item.title}
                        defaultOpen={isSubActive}
                        className="group/collapsible"
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton
                              tooltip={collapsed ? item.title : undefined}
                              className={
                                isSubActive
                                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                  : ''
                              }
                            >
                              <item.icon className="mr-2 h-4 w-4" />
                              {!collapsed && <span>{item.title}</span>}
                              {!collapsed && (
                                <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                              )}
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {subItems.map((subItem) => {
                                const SubIcon = subItem.icon || item.icon;
                                return (
                                  <SidebarMenuSubItem key={subItem.url}>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={location.pathname === subItem.url}
                                    >
                                      <NavLink to={subItem.url}>
                                        <SubIcon className="mr-2 h-3 w-3" />
                                        <span>{subItem.title}</span>
                                      </NavLink>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  }

                  // Item normal sem subitens
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={location.pathname === item.url}
                        tooltip={collapsed ? item.title : undefined}
                      >
                        <NavLink to={item.url!} end>
                          <item.icon className="mr-2 h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Admin Section - Mostrar para quem tem QUALQUER permissão de admin */}
        {visibleAdminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.url}
                      tooltip={collapsed ? item.title : undefined}
                    >
                      <NavLink to={item.url} end>
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
