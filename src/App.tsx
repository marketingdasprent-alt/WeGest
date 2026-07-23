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
            <NotificacoesProvider>
              <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
                <TooltipProvider>
                  <Toaster />
                  <Sonner />
                  <UpdateNotification />
                  <BrowserRouter>
                    {isNativeDriverOnlyMode() ? (
                      <NativeAppRoutes />
                    ) : (
                      <>
                        <WebAppRoutes />
                        <NotificacoesPopup />
                        <OnboardingColaboradorDialog />
                      </>
                    )}
                  </BrowserRouter>
                </TooltipProvider>
              </ThemeProvider>
            </NotificacoesProvider>
          </PermissionsProvider>
        </TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
