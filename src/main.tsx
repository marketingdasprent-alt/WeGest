import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { Capacitor } from '@capacitor/core';

import { removeLegacyAuthenticatedCache } from '@/lib/pwaCacheCleanup';
import { arrancarPwa, usaServiceWorker } from '@/lib/pwaArranque';

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

// Service worker só na web da app: nem no nativo (tela branca e reloads em
// loop) nem em docs.wegest.pt, onde se desliga a quem já o tinha (ver pwaArranque).
const nativo = Capacitor.isNativePlatform();
if (usaServiceWorker(nativo, window.location.hostname)) void removeLegacyAuthenticatedCache();
arrancarPwa({ nativo, hostname: window.location.hostname, registerSW });

createRoot(document.getElementById('root')!).render(<App />);
