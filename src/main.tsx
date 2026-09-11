import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { Capacitor } from '@capacitor/core';

import { removeLegacyAuthenticatedCache } from '@/lib/pwaCacheCleanup';

import App from './App.tsx';
import './index.css';
import { setupNativeApp } from './lib/native-bootstrap';

void setupNativeApp();

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
