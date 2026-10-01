import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

// ─── Leitor da documentação da API (Scalar) fora do precache ────────────────
// O Scalar parte-se em ~90 chunks (Vue, ícones, codemirror…) e só serve a rota
// pública /api/docs. Um módulo é "só da documentação" quando se alcança a
// partir do ApiDocsPage mas não a partir de nenhuma entrada da app sem passar
// por ele. Os chunks feitos só desses módulos vão para assets/scalar/, que o
// workbox ignora. Critério pelo grafo, não pelo nome do pacote: um sub-chunk
// do Scalar pode ter Vue ou outras dependências dele lá dentro.
const PAGINA_DOCS = path.resolve(__dirname, 'src/pages/ApiDocsPage.tsx').replace(/\\/g, '/');
const modulosSoDaDocumentacao = new Set<string>();
const normalizarId = (id: string) => id.replace(/\\/g, '/').split('?')[0];

function separarDocumentacaoDaApi(): Plugin {
  return {
    name: 'wegest-separar-documentacao-da-api',
    apply: 'build',
    buildEnd() {
      modulosSoDaDocumentacao.clear();
      const ids = [...this.getModuleIds()];
      const pagina = ids.find((id) => normalizarId(id) === PAGINA_DOCS);
      if (!pagina) return;
      const filhos = (id: string) => {
        const info = this.getModuleInfo(id);
        return info ? [...info.importedIds, ...info.dynamicallyImportedIds] : [];
      };
      const alcancaveis = (inicio: string[], bloqueado?: string) => {
        const vistos = new Set<string>();
        const fila = inicio.filter((id) => id !== bloqueado);
        while (fila.length) {
          const id = fila.pop() as string;
          if (vistos.has(id)) continue;
          vistos.add(id);
          for (const f of filhos(id)) if (f !== bloqueado && !vistos.has(f)) fila.push(f);
        }
        return vistos;
      };
      const entradas = ids.filter((id) => this.getModuleInfo(id)?.isEntry);
      const daApp = alcancaveis(entradas, pagina);
      for (const id of alcancaveis([pagina])) if (!daApp.has(id)) modulosSoDaDocumentacao.add(id);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: '::',
    port: 8080,
  },
  plugins: [
    react(),
    separarDocumentacaoDaApi(),

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
        // O leitor da documentação da API (Scalar, ~1 MB gzip) só serve a rota
        // pública /api/docs: não vai para o precache de todos os utilizadores.
        globIgnores: ['**/images/**', '**/assets/scalar/**', '**/assets/ApiDocsPage-*'],
        // /api/rent-a-car[/*] é a API externa (rewrite da Vercel), não uma rota da
        // SPA: o SW não pode responder-lhe com o index.html.
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\/rent-a-car(\/|$)/],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Nota: o vite-plugin-pwa precacheia SEMPRE o manifest.webmanifest (não
        // tem interruptor, e `manifestTransforms` não chega às entradas que ele
        // acrescenta). Quem já tem a app instalada só vê um `start_url` novo
        // depois de aceitar a actualização do SW e de o Chrome reler o manifest.
        // Entretanto é a `RaizDaApp` (rota `/`) que garante que a app instalada
        // abre no painel do motorista.
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
        // Chunks feitos só de módulos da documentação da API → assets/scalar/
        // (fora do precache, ver separarDocumentacaoDaApi). O resto fica igual.
        chunkFileNames: (chunk) =>
          chunk.moduleIds.length > 0 &&
          chunk.moduleIds.every((id) => modulosSoDaDocumentacao.has(id))
            ? 'assets/scalar/[name]-[hash].js'
            : 'assets/[name]-[hash].js',
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
