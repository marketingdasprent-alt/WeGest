import { cn } from '@/lib/utils';
import { useMotoristaTab } from '@/hooks/useMotoristaTab';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { MOTORISTA_TABS } from './motoristaNav';

/**
 * Menu do painel do motorista (desktop). A lista de secções é a mesma da barra
 * inferior do telemóvel; a secção activa vem do URL, não de estado fixo.
 */
export function MotoristaSidebar() {
  const { tab, irPara } = useMotoristaTab();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <SidebarHeader className="px-6 py-6">
        <div className="flex items-center justify-center">
          <img src="/Logo.png" alt="WeGest" className="h-12 w-auto object-contain" />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {MOTORISTA_TABS.map((t) => {
                const activo = t.id === tab;
                return (
                  <SidebarMenuItem key={t.id}>
                    <SidebarMenuButton
                      isActive={activo}
                      onClick={() => {
                        irPara(t.id);
                        // Em modo folha (telemóvel) o menu tapa o conteúdo: fecha-se ao escolher.
                        if (isMobile) setOpenMobile(false);
                      }}
                      className={cn(
                        'h-10 w-full rounded-lg px-3 transition-colors',
                        activo
                          ? 'bg-primary/10 font-semibold text-primary hover:bg-primary/15 hover:text-primary'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )}
                    >
                      <t.icon className="h-4 w-4" aria-hidden="true" />
                      <span className="text-sm">{t.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
