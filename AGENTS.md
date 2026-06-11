# AGENTS.md — Guia de Arquitectura e Convenções

> **Década Ousada / WeGest** · Sistema de gestão de frotas TVDE + Rent-a-car
> Stack: React 18 + TypeScript + Vite + Supabase + TanStack Query + Tailwind + Capacitor 8

Fonte de verdade para developers humanos e agentes IA. Em conflito com legacy, este documento prevalece.

---

## Índice

1. [Arquitectura em camadas](#1-arquitectura-em-camadas)
2. [Estrutura de ficheiros](#2-estrutura-de-ficheiros)
3. [Nomenclatura](#3-nomenclatura)
4. [Padrão de páginas e componentes](#4-padrão-de-páginas-e-componentes)
5. [React Query (server state)](#5-react-query-server-state)
6. [Estado: local vs global vs server](#6-estado-local-vs-global-vs-server)
7. [Validação com Zod](#7-validação-com-zod)
8. [Error handling](#8-error-handling)
9. [Tipos TypeScript](#9-tipos-typescript)
10. [UX patterns (3 estados + feedback)](#10-ux-patterns-3-estados--feedback)
11. [Segurança (RLS + variáveis)](#11-segurança-rls--variáveis)
12. [Anti-patterns](#12-anti-patterns)
13. [Tooling (Prettier, ESLint, scripts)](#13-tooling-prettier-eslint-scripts)
14. [Multi-tenancy + Auth](#14-multi-tenancy--auth)
15. [Checklist antes de commit](#15-checklist-antes-de-commit)
16. [Prompts Especificos](#16-regras-para-agentes-ia-claude-gpt-cursor-windsurf-etc)

---

## 1. Arquitectura em camadas

Cada camada só comunica com a imediatamente abaixo.

```
Page (src/pages/*.tsx)          ← compõe layout + componentes + hooks
  └─ Component (src/components/<feature>/*) ← UI, props in/out
      └─ Hook (src/hooks/use*.ts) ← React Query, mutations
          └─ supabase client     ← auto-tipado (types.ts)
              └─ Supabase + RLS  ← segurança real
```

**Regras invioláveis:**

- **Páginas** compõem. **Não** fazem queries directas. **Não** ultrapassam ~150 linhas.
- **Componentes** recebem dados via props. Limite indicativo: ~150 linhas — acima disso, dividir.
- **Hooks** são o **único** ponto de acesso a Supabase. Cada domínio tem o seu (`useMotoristas`, `useReservas`).
- **Mutations** preferencialmente em hooks (`useCreateMotorista`). Inline só quando localizado.

---

## 2. Estrutura de ficheiros

```
src/
├── App.tsx, main.tsx
├── routes/                  ← WebAppRoutes.tsx, NativeAppRoutes.tsx
├── pages/                   ← Top-level pages (flat, sem subpastas por role)
├── components/
│   ├── ui/                  ← Shadcn/Radix — NÃO EDITAR
│   └── <feature>/           ← admin, crm, motoristas, renting, ...
├── hooks/                   ← use*.ts (domain) | use-*.tsx (UI, Shadcn)
├── contexts/                ← Auth, Permissions (só estes 2)
├── types/                   ← Tipos de domínio à mão
├── lib/                     ← Helpers com integrações (Capacitor, pt-validators)
├── utils/                   ← Helpers puros (formatters, etc.)
└── integrations/supabase/   ← client.ts, types.ts (auto-gerado, NÃO EDITAR)
```

### Onde colocar código novo

| Tipo                      | Localização                                                  |
| ------------------------- | ------------------------------------------------------------ |
| Nova página               | `src/pages/NomeDaPagina.tsx` (flat)                          |
| Componente de feature     | `src/components/<feature>/NomeDoComponente.tsx`              |
| Hook de domínio           | `src/hooks/useNomeDoDominio.ts`                              |
| Hook de UI (Shadcn-style) | `src/hooks/use-nome.tsx`                                     |
| Tipo de domínio           | `src/types/nomeDoDominio.ts` + re-export em `types/index.ts` |
| Helper puro               | `src/utils/nomeDoHelper.ts`                                  |
| Helper com side-effects   | `src/lib/nome.ts`                                            |
| Lógica Supabase nova      | Hook em `src/hooks/` — **nunca** em page/component           |

---

## 3. Nomenclatura

| Artefacto                  | Convenção              | Exemplo                              |
| -------------------------- | ---------------------- | ------------------------------------ |
| Componente / página        | `PascalCase.tsx`       | `MotoristaCard.tsx`                  |
| Hook de domínio            | `camelCase.ts`         | `useMotoristas.ts`                   |
| Hook UI (Shadcn)           | `use-kebab.tsx`        | `use-toast.ts`                       |
| Tipo de domínio            | `camelCase.ts`         | `motorista.ts`                       |
| Subpasta feature           | `kebab-case`           | `motorista-portal/`                  |
| Componentes React          | `PascalCase`           | `EmpresaTable`                       |
| Variáveis / funções        | `camelCase`            | `motoristaAtivo`                     |
| Constantes                 | `SCREAMING_SNAKE_CASE` | `MAX_RETRIES`                        |
| Tipos / interfaces         | `PascalCase`           | `UseMotoristasOptions`               |
| Union literais (preferido) | `'a' \| 'b'`           | `type Status = 'ativo' \| 'inativo'` |
| `queryKey` React Query     | `[domínio, filtros?]`  | `['motoristas', { ativos: true }]`   |
| Boolean                    | `is/has/should/can`    | `isLoading`, `hasError`              |
| Event handlers             | `handle<Event>`        | `handleSubmit`                       |
| Props event handlers       | `on<Event>`            | `onSubmit`                           |

### Vocabulário PT-PT

Termos do domínio sempre em português, alinhados com Supabase: `motorista`, `viatura`, `empresa`, `contrato`, `reserva`, `cliente`, `recolha`, `troca`, `entrega`, `check-in`, `check-out`, `estacao`. **Não misturar** `driver`/`motorista` no mesmo conceito.

---

## 4. Padrão de páginas e componentes

### Página (compõe, não faz)

```tsx
export default function MotoristasPage() {
  const [apenasAtivos, setApenasAtivos] = useState(false);
  const { data, isLoading, error } = useMotoristas({ apenasAtivos });

  return (
    <DashboardLayout>
      <MotoristasFiltros apenasAtivos={apenasAtivos} onChange={setApenasAtivos} />
      <MotoristasTable motoristas={data ?? []} isLoading={isLoading} error={error} />
    </DashboardLayout>
  );
}
```

### Componente (3 estados explícitos)

```tsx
interface MotoristasTableProps {
  motoristas: Motorista[];
  isLoading: boolean;
  onDelete: (id: string) => Promise<void>;
}

export const MotoristasTable: React.FC<MotoristasTableProps> = ({
  motoristas,
  isLoading,
  onDelete,
}) => {
  if (isLoading) return <Loader2 className="animate-spin" />;
  if (motoristas.length === 0) return <p>Sem motoristas registados.</p>;
  return <div>{/* tabela */}</div>;
};
```

**Convenções de código:**

- Path alias `@/*` → `src/*`. **Nunca** `../../`.
- Named exports preferidos (`export const Foo`). Excepção: pages podem usar default para lazy loading.
- Props sempre tipadas com `interface` explícita.
- Aspas simples (Prettier). JSX attributes com aspas duplas.

**Ordem de imports:** 1) React, 2) externos, 3) `@/*` internos, 4) relativos, 5) tipos.

---

## 5. React Query (server state)

Toda a interacção com Supabase passa por React Query. QueryClient global em [App.tsx](src/App.tsx) com `refetchOnWindowFocus: false`.

### Hook de leitura

```typescript
interface UseMotoristasOptions {
  apenasAtivos?: boolean;
  enabled?: boolean;
}

export function useMotoristas(options: UseMotoristasOptions = {}) {
  const { apenasAtivos = false, enabled = true } = options;

  return useQuery({
    queryKey: ['motoristas', { apenasAtivos }],
    queryFn: async () => {
      let q = supabase.from('motoristas_ativos').select('*').order('nome');
      if (apenasAtivos) q = q.eq('status_ativo', true);
      const { data, error } = await q;
      if (error) throw error;
      return data as Motorista[];
    },
    enabled,
  });
}
```

### Hook de mutation

```typescript
export function useCreateMotorista() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (motorista: MotoristaInsert) => {
      const { data, error } = await supabase.from('motoristas').insert(motorista).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['motoristas'] });
      toast({ title: 'Motorista criado' });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Erro inesperado';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });
}
```

**Convenções:**

- `queryKey: [domínio, filtros?]` — filtros como segundo elemento (permite invalidação granular).
- `queryFn` faz `throw` no erro Supabase — React Query trata.
- Devolver o objecto `useQuery` directamente, sem wrappers.
- **Sempre invalidar queries afectadas** no `onSuccess`.
- Não criar `useState + useEffect` para fetching — usar `useQuery`.

---

## 6. Estado: local vs global vs server

| Tipo           | Ferramenta                | Exemplos                       |
| -------------- | ------------------------- | ------------------------------ |
| Server state   | React Query               | Motoristas, viaturas, reservas |
| Local UI state | `useState` / `useReducer` | Modal aberto, tab activa       |
| Form state     | `react-hook-form` + Zod   | Formulários                    |
| Global (raro)  | Context                   | Auth, permissões, tenant       |
| URL state      | `useSearchParams`         | Filtros partilháveis           |

**Regras:**

- **Não duplicar** server state em `useState`. Cache é React Query.
- **Evitar Contexts novos**. Antes de criar, pergunta: "isto pode ser uma queryKey?" Projeto tem apenas `AuthContext`, `PermissionsContext`, `TenantContext`.
- **Form state nunca em Context** — `react-hook-form` local.

---

## 7. Validação com Zod

```typescript
export const motoristaSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  nif: z.string().refine(validarNIF, 'NIF inválido'),
  ativo: z.boolean().default(true),
});

export type MotoristaInput = z.infer<typeof motoristaSchema>;

const form = useForm<MotoristaInput>({
  resolver: zodResolver(motoristaSchema),
  defaultValues: { ativo: true },
});
```

- **Schema é fonte de verdade do tipo** — derivar com `z.infer`, nunca duplicar.
- Mensagens em **PT-PT**.
- Validações PT (NIF, IBAN, CP, telemóvel) → [src/lib/pt-validators.ts](src/lib/pt-validators.ts).
- Validação no client é UX — **não substitui** validação no Supabase (CHECK constraints + RLS).

---

## 8. Error handling

```tsx
// Handlers async: catch (error: unknown), nunca any
const handleSubmit = async (data: MotoristaInput) => {
  try {
    const { error } = await supabase.from('motoristas').insert(data);
    if (error) throw error;
    toast({ title: 'Criado com sucesso' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro inesperado';
    toast({ title: 'Erro', description: message, variant: 'destructive' });
  }
};
```

- Em `useMutation`, preferir `onError` ao try/catch no callsite.
- **Nunca** silenciar com `catch {}`.
- Reduzir `unknown` → `string` com `error instanceof Error ? error.message : 'fallback'`.

---

## 9. Tipos TypeScript

```typescript
import type { Database } from '@/integrations/supabase/types';

type Motorista = Database['public']['Tables']['motoristas']['Row'];
type MotoristaInsert = Database['public']['Tables']['motoristas']['Insert'];
type MotoristaUpdate = Database['public']['Tables']['motoristas']['Update'];
```

- **Sempre** usar tipos auto-gerados ([src/integrations/supabase/types.ts](src/integrations/supabase/types.ts)). **Nunca editar manualmente** — regenerar com `supabase gen types typescript`.
- Composições de domínio → criar tipo em `src/types/<dominio>.ts`.
- `any` está `off` no ESLint mas é dívida — preferir tipos específicos.
- Preferir **union literals** a enums TypeScript.

---

## 10. UX patterns (3 estados + feedback)

Componentes que mostram dados tratam **3 estados explicitamente**: loading, empty, populated (+ error quando aplicável).

```tsx
if (isLoading) return <Loader2 className="animate-spin" />;
if (error) return <div className="text-destructive">Erro: {error.message}</div>;
if (data.length === 0) return <EmptyState />;
return <Lista data={data} />;
```

Para botões durante mutations: `disabled={mutation.isPending}` + spinner.

### Feedback após acções

| Acção                | Feedback                                             |
| -------------------- | ---------------------------------------------------- |
| Mutation com sucesso | Toast verde (title apenas)                           |
| Mutation com erro    | Toast `variant: 'destructive'` + descrição           |
| Loading              | Botão `disabled` + spinner                           |
| Após criar/editar    | Invalidate queries + toast + navigate (se aplicável) |
| Após eliminar        | `AlertDialog` de confirmação + invalidate + toast    |

### Toasts

- **Default:** `useToast()` de [src/hooks/use-toast.ts](src/hooks/use-toast.ts).
- **Sonner** (`import { toast } from 'sonner'`) reservado para notificações persistentes.

---

## 11. Segurança (RLS + variáveis)

> **Princípio:** frontend é hostil. Segurança real vive no Supabase via RLS.

### RLS

- **Todas as tabelas com dados de utilizador** têm RLS activa.
- Políticas assumem o pior caso: sem permissões, sessão expirada, tentativa de elevação.
- Verificar em Supabase Dashboard → Authentication → Policies.

### O que NUNCA fazer

```typescript
// ❌ Confiar em check de role só no frontend (RLS deve bloquear server-side)
if (user.role === 'admin') return <DeleteAllButton />;

// ❌ Expor service-role key no client
const supabase = createClient(url, SERVICE_ROLE_KEY); // Só em Edge Functions

// ❌ Lógica de autorização em hooks/componentes (usar RLS + has_role())
const { data: admins } = await supabase.from('admins').select('*');
if (admins.find(a => a.id === user.id)) { /* ... */ }
```

### Variáveis de ambiente

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — públicos, bundled no client.
- `SUPABASE_SERVICE_ROLE_KEY` — **nunca** prefixar com `VITE_`. Só em Edge Functions e CI.
- `.env.local` git-ignored.

### Permissões granulares

- Vivem em tabelas Supabase (`cargo_permissoes`) aplicadas via RLS + `has_permission(uid, recurso)`.
- Hooks ([usePermissions](src/hooks/usePermissions.ts), `useAdmin`, `useRBAC`) servem **só UX** (esconder botões).

---

## 12. Anti-patterns

| Anti-pattern                               | Em vez disso                                      |
| ------------------------------------------ | ------------------------------------------------- |
| Query Supabase em página/component         | Hook `useFeature()` com React Query               |
| `useState + useEffect` para fetch          | `useQuery`                                        |
| `any` por preguiça                         | Tipo auto-gerado ou custom                        |
| Componente 500+ linhas                     | Dividir em sub-componentes                        |
| Context para server state                  | React Query                                       |
| Context novo para cada feature             | Hook + React Query                                |
| `console.log` em código merged             | Remover, ou `console.warn`/`error` com contexto   |
| `import { foo } from '../../../utils/foo'` | `import { foo } from '@/utils/foo'`               |
| Validação só no client                     | Validar TAMBÉM no Supabase (constraints + RLS)    |
| Service-role key no client                 | Edge Function com service-role                    |
| `catch {}` vazio                           | Log + toast, ou propagar                          |
| `driver` e `motorista` misturados          | Escolher um (motorista)                           |
| Estado loading manual com `useQuery`       | Usar `isLoading`/`isPending` do hook              |
| Mutation sem `invalidateQueries`           | Sempre invalidar afectadas                        |
| Edit de `supabase/types.ts`                | Regenerar                                         |
| Hardcoded routes em strings                | Constantes (criar `lib/routes.ts` quando crescer) |
| Default export para componentes não-página | Named export                                      |
| Tipo duplicado à mão                       | `z.infer<typeof schema>` ou `Pick`/`Omit`         |

---

## 13. Tooling (Prettier, ESLint, scripts)

### Scripts essenciais

```bash
pnpm dev               # Vite dev server
pnpm build             # Build produção
pnpm type-check        # tsc --noEmit
pnpm lint              # ESLint
pnpm test              # Vitest (run única)
pnpm test:watch        # Vitest em watch mode
pnpm format            # Prettier write
pnpm format:check      # Prettier check (CI)
```

**Package manager:** pnpm (travado em `packageManager: pnpm@11.0.9`). Não usar npm.

### Decisões do projecto

- **Prettier:** config em [.prettierrc](.prettierrc) — `printWidth: 100`, `singleQuote: true`, `semi: true`.
- **ESLint:** algumas regras estão `off`/`warn` por motivos históricos ([eslint.config.js](eslint.config.js)). **Código novo deve passar como se fossem `error`** — laxismo é para legacy.
- **Ignorados pelo lint:** `dist/`, `android/`, `ios/`, `supabase/` (Edge Functions Deno), `src/integrations/supabase/types.ts`.
- **Vitest** (`pnpm test` / `pnpm test:watch`) — testes unitários em `src/**/*.test.ts`. Cobertura actual: `pt-validators` (NIF, IBAN, CP, telefone, documentos). Lógica pura nova deve trazer testes. Sem Playwright (E2E em backlog).

### Capacitor (mobile)

Duas plataformas servidas do mesmo bundle, escolha em [App.tsx](src/App.tsx) via `isNativeDriverOnlyMode()`:

- **Web** (Vercel) → [WebAppRoutes.tsx](src/routes/WebAppRoutes.tsx)
- **Native** (Android/iOS) → [NativeAppRoutes.tsx](src/routes/NativeAppRoutes.tsx)

CI/CD: workflows em [.github/workflows/](.github/workflows/) (`android-release.yml`, `ios-release.yml`).

---

## 14. Multi-tenancy + Auth

### Multi-tenancy

Projecto é SaaS multi-tenant. Tabelas de negócio têm `org_id NOT NULL REFERENCES organizacoes(id)`.

- **Função BD:** `get_current_org_id()` lê de `user_org_ativa`.
- **Default em colunas novas:** `org_id UUID NOT NULL DEFAULT public.get_current_org_id()` — app não precisa de enviar.
- **RLS em todas as policies:** `org_id = public.get_current_org_id()` + check de permissão.
- **Frontend:** [TenantContext](src/contexts/TenantContext.tsx) com `useTenant()` / `useOrgId()`.
- **Subdomínios:** `<codigo>.wegest.pt` por org (excepto Década Ousada que usa `wegest.pt` directo).

### Auth

```
AuthProvider → user, session, signOut + onAuthStateChange
  └─ TenantProvider → orgId, orgs, switchOrg
      └─ PermissionsProvider → permissões granulares
```

- API: `useAuth()`, `useTenant()`, `usePermissions()`.
- Hooks de RBAC: [useRBAC](src/hooks/useRBAC.ts), [useAdmin](src/hooks/useAdmin.ts).
- **Autorização real está no Supabase via RLS** — hooks frontend só para UX.

---

## 15. Checklist antes de commit

```
OBRIGATÓRIO
[ ] pnpm type-check         → sem erros TS
[ ] pnpm lint               → sem errors (warnings tolerados)
[ ] pnpm format:check       → código formatado
[ ] pnpm test               → testes verdes
[ ] pnpm build              → build passa
[ ] Sem console.log soltos
[ ] Sem credenciais/secrets
[ ] Service-role nunca no client
[ ] @ts-expect-error com motivo (não @ts-ignore)

BOAS PRÁTICAS
[ ] Props tipadas com interface
[ ] queryKey consistente [domínio, filtros?]
[ ] Mutations invalidam queries afectadas
[ ] 3 estados explícitos (loading/empty/populated/error)
[ ] Componente ≤ ~150 linhas
[ ] Página apenas compõe — sem queries directas
[ ] Path aliases @/
[ ] PT-PT consistente (motorista, viatura, reserva, cliente, ...)
[ ] Sem novos Contexts (a menos que justificado)
[ ] RLS verificada para tabelas afectadas
[ ] org_id em tabelas novas (multi-tenancy)
```

### Commits (Conventional Commits)

Formato: `<tipo>: <descrição em PT>` — `feat`, `fix`, `refactor`, `docs`, `style`, `chore`, `perf`.

```bash
git commit -m "feat: adicionar aba de contratos"
git commit -m "fix: corrigir overbooking em reservas concorrentes"
```

### Antes de declarar tarefa concluída (AI agents)

1. type-check + lint + build passam
2. UI nova: testar manualmente os 3 estados em browser
3. Tocou em rotas: confirmar Web + Native consistentes
4. Tocou em Supabase: verificar RLS das tabelas afectadas
5. Tocou em multi-tenancy: confirmar `org_id` filtrado nas policies

---

## 16. Regras para Agentes IA (Claude, GPT, Cursor, Windsurf, etc.)

Estas regras têm prioridade sobre qualquer implementação sugerida pelo agente.

### Processo obrigatório antes de escrever código

Antes de gerar qualquer código:

1. Analisar toda a arquitetura relevante da funcionalidade.
2. Explicar quais partes do sistema podem ser impactadas.
3. Identificar possíveis regressões ou efeitos secundários.
4. Verificar ficheiros, funções, componentes e dependências reais do projeto.
5. Nunca assumir que algo existe sem confirmar primeiro.

O agente deve explicar o plano de implementação antes de modificar código quando a alteração afetar múltiplos módulos.

---

### Respeito pelo escopo

- Nunca modificar ficheiros fora do escopo da tarefa.
- Se for necessário alterar outros ficheiros, explicar primeiro:
  - quais serão alterados;
  - por que motivo;
  - qual o impacto esperado.

Nenhuma alteração extra deve ser feita sem justificação explícita.

---

### Reutilização antes de criação

Antes de criar código novo:

1. Procurar componentes existentes.
2. Procurar hooks existentes.
3. Procurar utilitários existentes.
4. Procurar tipos já definidos.
5. Procurar padrões já utilizados no projeto.

Evitar duplicação de lógica.

Se existir uma implementação compatível, reutilizá-la.

---

### Qualidade de produção

Assumir sempre que o projeto é mantido por uma equipa senior em ambiente de produção.

Todo o código novo deve ser:

- legível;
- modular;
- tipado;
- fácil de testar;
- fácil de debugar;
- consistente com os padrões existentes.

---

### Simplicidade acima de complexidade

Quando existirem várias soluções possíveis:

- escolher a mais simples;
- escolher a mais fácil de manter;
- escolher a mais escalável;
- evitar abstrações prematuras;
- evitar overengineering.

Preferir clareza a "engenharia criativa".

---

### Proteção contra regressões

Nunca eliminar:

- funcionalidades;
- componentes;
- hooks;
- páginas;
- permissões;
- regras de negócio;

sem aprovação explícita.

Se uma remoção parecer necessária, pedir confirmação primeiro.

---

### Revisão obrigatória após alterações

Depois de cada implementação, o agente deve verificar:

- erros TypeScript;
- imports quebrados;
- exports quebrados;
- dependências em falta;
- problemas de hidratação;
- problemas de SSR;
- inconsistências de tipos;
- referências obsoletas;
- regressões óbvias.

---

### Mentalidade de trabalho

Trabalhar devagar e com precisão.

Priorizar análise e segurança sobre velocidade de implementação.

É preferível gastar mais tempo a analisar do que introduzir regressões que exijam horas de correção.

---

### Fluxo obrigatório de execução

1. Analisar arquitetura existente.
2. Identificar impacto da alteração.
3. Procurar reutilização.
4. Implementar apenas o necessário.
5. Rever possíveis regressões.
6. Executar:
   - pnpm type-check
   - pnpm lint
   - pnpm build

7. Só depois declarar a tarefa concluída.

8. Quando a tarefa envolver refactor, apresente primeiro o plano de refatoração e aguarde aprovação antes de alterar múltiplos módulos do sistema.

_Última actualização: 2026-05-18 · WeGest (Década Ousada)_
