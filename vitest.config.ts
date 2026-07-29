import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    // supabase/functions/** são Edge Functions Deno (imports remotos
    // https://deno.land/..., Deno.test) — o loader ESM do Node/Vitest não os
    // executa. Correm com `deno test`, não com `pnpm test`.
    // .claude/worktrees/** fica gitignored mas mora dentro do repo — os globs
    // de teste varrem tudo em src/**, por isso um worktree aninhado aí já
    // causou testes a crashar por 2 instâncias de React (ver .gitignore).
    exclude: [...configDefaults.exclude, 'supabase/**', '.claude/worktrees/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
        '**/*.test.ts',
        '**/*.test.tsx',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
