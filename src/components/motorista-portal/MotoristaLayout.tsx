import React from 'react';
import { LogOut } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { MotoristaSidebar } from './MotoristaSidebar';
import { MotoristaBottomNav } from './MotoristaBottomNav';

interface MotoristaLayoutProps {
  children: React.ReactNode;
  userName?: string;
  userPhoto?: string;
}

/**
 * Moldura do portal do motorista: cabeçalho, menu e conteúdo.
 *
 * Telemóvel: barra de secções fixa ao fundo (o polegar chega lá) e sem botão
 * de menu no cabeçalho — seria um segundo menu para as mesmas quatro coisas.
 * Desktop: sidebar aberta por omissão com as mesmas secções.
 */
export const MotoristaLayout: React.FC<MotoristaLayoutProps> = ({
  children,
  userName,
  userPhoto,
}) => {
  const { signOut } = useAuth();

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-svh w-full overflow-x-hidden bg-background">
        <MotoristaSidebar />

        <SidebarInset className="flex min-w-0 flex-1 flex-col bg-transparent">
          <header className="native-header sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/90 px-3 backdrop-blur-xl md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="hidden shrink-0 text-muted-foreground hover:text-foreground lg:inline-flex" />
              <Avatar className="h-8 w-8 border border-border lg:hidden">
                <AvatarImage src={userPhoto} />
                <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                  {userName?.charAt(0) || 'M'}
                </AvatarFallback>
              </Avatar>
              <p className="truncate text-sm font-semibold text-foreground">
                {userName || 'Motorista'}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <ThemeToggle />
              <Avatar className="hidden h-8 w-8 border border-border lg:flex">
                <AvatarImage src={userPhoto} />
                <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                  {userName?.charAt(0) || 'M'}
                </AvatarFallback>
              </Avatar>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => signOut()}
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                aria-label="Terminar sessão"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </header>

          {/* `pb-24` no telemóvel: espaço para a barra fixa não tapar o fim da
              página. No desktop não há barra, volta ao padding normal. */}
          <main className="native-bottom flex-1 overflow-x-hidden p-3 pb-24 md:p-6 lg:p-8 lg:pb-8">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>

          <MotoristaBottomNav />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};
