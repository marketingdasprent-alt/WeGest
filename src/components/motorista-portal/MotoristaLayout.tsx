import React from 'react';
import { MotoristaSidebar } from './MotoristaSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Bell, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

interface MotoristaLayoutProps {
  children: React.ReactNode;
  userName?: string;
  userPhoto?: string;
}

export const MotoristaLayout: React.FC<MotoristaLayoutProps> = ({
  children,
  userName,
  userPhoto,
}) => {
  const { signOut } = useAuth();

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex w-full min-h-svh bg-background rota-liquida overflow-x-hidden">
        <MotoristaSidebar />

        <SidebarInset className="flex-1 flex flex-col min-w-0 bg-transparent">
          {/* Header */}
          <header className="native-header h-14 md:h-20 flex items-center justify-between px-3 md:px-8 border-b border-border sticky top-0 bg-background/90 backdrop-blur-xl z-20 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <SidebarTrigger className="shrink-0 text-muted-foreground hover:text-foreground" />
              <p className="text-sm font-bold text-foreground truncate">
                {userName || 'Motorista'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Tema: claro / escuro / sistema — escolha do motorista */}
              <ThemeToggle />

              <button className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <Bell className="w-4 h-4" />
                <div className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-background" />
              </button>

              <Avatar className="h-8 w-8 border border-border">
                <AvatarImage src={userPhoto} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                  {userName?.charAt(0) || 'M'}
                </AvatarFallback>
              </Avatar>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => signOut()}
                className="text-muted-foreground hover:text-destructive h-9 w-9"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {/* Conteúdo */}
          <main className="native-bottom flex-1 p-3 md:p-8 overflow-x-hidden">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};
