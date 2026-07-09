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

      <main
        className={
          fullBleed
            ? 'flex-1 min-w-0 w-full h-[calc(100vh-4rem)] lg:h-screen'
            : 'flex-1 min-w-0 p-4 md:p-8 w-full max-w-[1920px] mx-auto'
        }
      >
        {children}
      </main>
    </div>
  );
};
