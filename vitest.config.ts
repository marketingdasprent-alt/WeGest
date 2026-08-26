import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],

    // ── Estabilidade da suite (CI) ────────────────────────────────────────
    // `pnpm test` é um dos gates de CI, e estava a dar vermelho em código
    // verde: a MESMA versão do código deu 157 testes falhados numa execução e
    // 2 na seguinte, e todos passam quando corridos isoladamente. Os sintomas
    // eram `TypeError: Cannot read properties of null (reading 'useId')` — as
    // internas do React anuladas sob pressão de workers — e timeouts.
    //
    // Não era código lento: é contenção. São 118 ficheiros, cada um a montar o
    // seu próprio ambiente jsdom (~355 s de tempo de ambiente contra ~93 s de
    // tempo real), e o pool por omissão ('forks') abre quase um worker por CPU.
    //
    // Um build vermelho aleatório é o pior sinal de qualidade possível: treina
    // a equipa a ignorar o CI e a repetir até passar, e no dia em que houver
    // uma regressão a sério ela vai parecer mais uma flutuação.
    //
    // Percentagem em vez de número fixo de propósito: 50% dá 8 workers numa
    // máquina de 16 CPUs e 1–2 num runner de CI pequeno. Um valor fixo
    // sobrecarregaria o runner exactamente onde o problema aparece.
    maxWorkers: '50%',
    // 5000 ms (o default) é apertado quando vários ambientes jsdom competem —
    // era a causa da segunda ronda de falhas. 15 s dá folga sem esconder um
    // teste genuinamente pendurado.
    testTimeout: 15_000,
    hookTimeout: 15_000,
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
      exclude: ['node_modules/', 'src/__tests__/', '**/*.test.ts', '**/*.test.tsx'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Cálculo partilhado entre a aplicação e as edge functions. Vive em
      // supabase/functions/_shared/resumo/ porque é de lá que a publicação
      // das functions o sabe empacotar; a aplicação alcança-o por este alias.
      // Só entram ali ficheiros PUROS — sem imports, sem globais do Deno —
      // senão deixam de compilar de um dos dois lados.
      //
      // O `exclude` acima tira supabase/** da DESCOBERTA de testes (são
      // ficheiros Deno), o que não impede importar de lá. Os testes deste
      // código partilhado vivem em src/, e cobrem os dois consumidores por
      // ser o mesmo ficheiro.
      '@shared': path.resolve(__dirname, './supabase/functions/_shared/resumo'),
    },
  },
});
