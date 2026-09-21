import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { Capacitor } from '@capacitor/core';

import { removeLegacyAuthenticatedCache } from '@/lib/pwaCacheCleanup';

import App from './App.tsx';
import './index.css';
import { setupNativeApp } from './lib/native-bootstrap';

void setupNativeApp();

// Dev: mata qualquer service worker registado de uma sessão anterior (build de
// produção aberto no mesmo localhost, ou HMR que perdeu o timestamp). O plugin
// PWA não gera SW em dev (devOptions.enabled: false), mas um já registado
// continua a intercetar pedidos e a servir módulos velhos — o sintoma é
// "does not provide an export" num ficheiro que compila bem, com o mesmo `?t=`
// congelado em todos os erros por muito que se reinicie o Vite.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => void r.unregister());
  });
}

// Service Worker só na web — na app nativa causa tela branca e reloads em loop
if (!Capacitor.isNativePlatform()) {
  void removeLegacyAuthenticatedCache();

  const updateSW = registerSW({
    onNeedRefresh() {
      // Guardar a função de atualização globalmente para o App.tsx usar
      (window as any).__swUpdate = () => updateSW(true);
      window.dispatchEvent(new CustomEvent('sw-update-available'));
    },
    onOfflineReady() {},
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        // Verificar atualizações a cada 5 minutos (não a cada 20 segundos)
        setInterval(
          () => {
            registration.update();
          },
          5 * 60 * 1000
        );

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update();
          }
        });
      }
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
