import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { NotificacoesProvider } from '@/contexts/NotificacoesContext';
import { TenantProvider } from '@/contexts/TenantContext';
import { ThemeProvider } from 'next-themes';
import { isNativeDriverOnlyMode } from '@/lib/native';
import NativeAppRoutes from '@/routes/NativeAppRoutes';
import WebAppRoutes from '@/routes/WebAppRoutes';
import { UpdateNotification } from '@/components/UpdateNotification';
import { NotificacoesPopup } from '@/components/notificacoes/NotificacoesPopup';
import { OnboardingColaboradorDialog } from '@/components/onboarding/OnboardingColaboradorDialog';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TenantProvider>
          <PermissionsProvider>
            <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <UpdateNotification />
                {/*
                  NotificacoesProvider vive DENTRO do BrowserRouter porque decide
                  pela rota atual: notificações internas não podem ser lidas nem
                  mostradas em rotas públicas (landing, páginas institucionais,
                  quadro de TV). Fora do router não teria acesso ao pathname, e
                  era assim que os avisos apareciam sobre a landing.
                */}
                <BrowserRouter>
                  <NotificacoesProvider>
                    {isNativeDriverOnlyMode() ? (
                      <NativeAppRoutes />
                    ) : (
                      <>
                        <WebAppRoutes />
                        <NotificacoesPopup />
                        <OnboardingColaboradorDialog />
                      </>
                    )}
                  </NotificacoesProvider>
                </BrowserRouter>
              </TooltipProvider>
            </ThemeProvider>
          </PermissionsProvider>
        </TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
