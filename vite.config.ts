import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: '::',
    port: 8080,
  },
  plugins: [
    react(),

    VitePWA({
      registerType: 'prompt',
      devOptions: {
        enabled: false,
      },
      includeAssets: ['favicon.ico', 'Icon_Favicon.png', 'Logo.png'],
      manifest: {
        // A app instalada é o PORTAL DO MOTORISTA, não o backoffice: abre no
        // painel dele e é isso que o nome e a descrição dizem a quem a
        // instala. O backoffice continua no navegador — quem não tiver acesso
        // ao painel vê um aviso a dizê-lo (ver ProtectedRoute).
        name: 'WeGest Motorista',
        short_name: 'WeGest',
        description: 'A sua viatura, contas e documentos — portal do motorista',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        // Scope à raiz apesar de a app ser só do motorista, e é deliberado:
        // as rotas por onde ele ENTRA vivem fora de `/motorista/` — o login é
        // `/login` (para onde `/motorista/login` reencaminha) e a definição
        // de password é `/reset-password`, que é o primeiro ecrã de quem
        // recebe o convite. Com o scope em `/motorista/`, cada uma delas
        // abria numa barra de browser por cima da app, e entrar deixava de
        // parecer parte dela.
        //
        // Quem restringe o uso ao motorista não é o scope, é o
        // `ProtectedRoute`: instalada, a app não reencaminha ninguém para o
        // backoffice — mostra um aviso a dizer que é o portal do motorista.
        scope: '/',
        // `id` fixo e independente do `start_url`. Sem ele, a identidade da app
        // instalada É o start_url, e mudá-lo faria o browser tratar isto como
        // uma aplicação NOVA: quem já tem o WeGest no telemóvel ficaria com um
        // segundo ícone em vez de a app abrir noutro sítio.
        id: '/',
        // Única rota de entrada da app instalada.
        start_url: '/motorista/painel',
        icons: [
          {
            src: '/Icon_Favicon.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/Icon_Favicon.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/Icon_Favicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/Icon_Favicon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'apple touch icon',
          },
        ],
      },
      workbox: {
        skipWaiting: false,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,ico,svg,woff2}'],
        globIgnores: ['**/images/**'],
        navigateFallbackDenylist: [/^\/~oauth/],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Alias vindo do main: o codigo de resumo das edge functions usa-o.
      '@shared': path.resolve(__dirname, './supabase/functions/_shared/resumo'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-ui': ['lucide-react', 'clsx', 'tailwind-merge', 'class-variance-authority'],
          // Libs pesadas isoladas: chunk próprio (cacheável e fora do caminho
          // crítico quando carregadas via dynamic import).
          'vendor-xlsx': ['xlsx'],
          'vendor-pdf': ['jspdf'],
          'vendor-charts': ['recharts'],
          'vendor-motion': ['framer-motion'],
          'vendor-tiptap': ['@tiptap/react', '@tiptap/starter-kit'],
          // Só a aba de Automações o usa. Em chunk próprio, quem nunca lá vai
          // não o descarrega.
          'vendor-flow': ['@realflow/react'],
        },
      },
    },
  },
}));
