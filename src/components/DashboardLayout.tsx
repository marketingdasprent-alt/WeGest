import React from 'react';
import { SidebarMenu } from '@/components/navigation/SidebarMenu';

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** Remove o padding/max-width do main — para conteúdo que deve ocupar todo o espaço (ex: iframe). */
  fullBleed?: boolean;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, fullBleed }) => {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background w-full">
      <SidebarMenu />

      {/* `flex-none lg:flex-1` no ramo fullBleed, e não `flex-1` sempre.
          Acima de `lg` o contentor é uma LINHA e `flex-1` é o que faz o main
          ocupar a largura restante. Abaixo de `lg` é uma COLUNA, e aí `flex-1`
          traz `flex-basis: 0%`, que ganha à altura declarada: o main voltava a
          crescer com o conteúdo e as páginas que gerem o seu próprio scroll
          ficavam com um contentor tão alto como aquilo que deviam limitar —
          sem rolar, e sem deixar a janela rolar por causa do
          `overscroll-behavior-y: contain` global.
          Medido nas duas direcções a 1700, 1280, 900 e 500px. */}
      <main
        className={
          fullBleed
            ? 'flex-none lg:flex-1 min-w-0 w-full h-[calc(100vh-4rem)] lg:h-screen'
            : 'flex-1 min-w-0 p-4 md:p-8 w-full max-w-[1920px] mx-auto'
        }
      >
        {children}
      </main>
    </div>
  );
};
