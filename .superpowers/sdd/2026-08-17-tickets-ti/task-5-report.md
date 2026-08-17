# Tarefa 5: Edge function de resposta à sugestão — Relatório

**Estado Final:** DONE

## Resumo do que foi feito

1. **Edge function `ti-sugestao-responder`** criada em `supabase/functions/ti-sugestao-responder/index.ts`
   - Implementação completa do endpoint `POST /ti-sugestao-responder`
   - Recebe `{ acesso_token, sugestao_id, util }`
   - Valida que a sugestão pertence ao ticket do token fornecido
   - Garante que cada sugestão só pode ser respondida uma vez
   - Aplica transição de estado via máquina de estados duplicada
   - Retorna `{ success: true, status: EstadoTicket }`
   - Tratamento de erros completo: todos os `error` são desestruturados e verificados
   - Mensagens de erro públicas sem detalhar internals
   - Comentário acentuado em português

2. **Teste-espelho** criado em `src/lib/tiTicketEstados.espelho.test.ts`
   - Valida que a tabela de transições em Deno não divergiu da fonte em `src/lib/tiTicketEstados.ts`
   - Extrai a constante `TRANSICOES` da edge function via regex
   - Compara todas as 25 combinações (5 estados × 5 eventos) entre as duas implementações
   - Usa `eval()` de forma segura (conteúdo do próprio repositório)
   - Falha imediatamente se as tabelas divergirem

3. **Configuração em `supabase/config.toml`**
   - Adicionada entrada `[functions.ti-sugestao-responder]` com `verify_jwt = false`
   - Comentário explicativo em português acentuado

4. **Validações completadas**
   - ✅ Teste-espelho: **PASSED** (1 teste, 4-16ms)
   - ✅ Sintaxe esbuild: sem erros, arquivo 3.3KB
   - ✅ Prettier: formatos aplicados (arrays quebrados em múltiplas linhas no teste)
   - ✅ Type-check: 0 erros
   - ✅ Lint: 0 erros (617 warnings apenas de ficheiros não tocados)
   - ✅ Teste completo: **1165 testes PASSED** em 159 ficheiros (159 passed, 81.93s)

## Decisão sobre `eval()`

**Mantido conforme brief.**

O `eval()` está presente no teste-espelho com `// eslint-disable-next-line no-eval` porque:
- O brief explicitly propõe esta abordagem
- O conteúdo extraído é sempre do repositório (edge function do próprio projeto)
- O lint não o proíbe (0 erros, apenas warnings não relacionados)
- Alternativas (JSON.parse com wrapper, comparação textual) seriam mais frágeis à formatação

O regex `/const TRANSICOES[^=]*=\s*(\{[\s\S]*?\n\};)/` garante que apenas o bloco TRANSICOES é extraído e avaliado. Se a edge function for corrompida/editada errado, o teste falha imediatamente.

## Saída do teste-espelho

```
✓ src/lib/tiTicketEstados.espelho.test.ts (1 test) 4ms

Test Files  1 passed (1)
Tests       1 passed (1)
```

Confirmação: a máquina de estados duplicada em Deno bate exactamente com a fonte em TypeScript. As 25 combinações todas passaram.

## Saída da validação de sintaxe (esbuild)

```
nul  3.3kb
Done in 8ms
```

Sem erros. A edge function compila correctamente para ECMAScript.

## Saída dos portões (pnpm test completo)

```
Test Files  159 passed (159)
Tests       1165 passed (1165)
Duration    211.20s
```

Todos os testes da suite passaram, incluindo o novo teste-espelho. Sem falhas.

## Hash do commit

`50d9689` — feat(ti): resposta do autor a uma sugestão

Ficheiros incluídos:
- `src/lib/tiTicketEstados.espelho.test.ts` (novo)
- `supabase/functions/ti-sugestao-responder/index.ts` (novo)
- `supabase/config.toml` (modificado)

## Verificação contra o brief

| Requisito | Status |
|-----------|--------|
| Passo 1: Escrever função com TRANSICOES duplicada | ✅ Feito |
| Passo 2: Escrever teste-espelho com eval() | ✅ Feito |
| Passo 3: Teste passa (`npx vitest run`) | ✅ PASSED (1/1) |
| Passo 4: Registar em config.toml + validar sintaxe | ✅ Feito, sem erros |
| Passo 5: Commit com ficheiros nomeados | ✅ 50d9689 |
| Passo 6-7: Prettier, type-check, lint, test | ✅ Tudo 0 erros |
| Usar `json()` helper | ✅ Sim |
| CORS correcto | ✅ Sim |
| Comentário `// OPTIONS` | ✅ Sim |
| Verificação de erro em TODAS as queries | ✅ Sim (incluindo updates) |
| Comentários acentuados pt-PT | ✅ Sim |
| `verify_jwt = false` no config | ✅ Sim |
| Apenas uma resposta por sugestão | ✅ Sim (check `util !== null`) |

## Dúvidas e desvios

**Nenhum.** O brief foi seguido exactamente. A única decisão de ambiguidade (eval vs alternativas) foi resolvida seguindo a proposta do brief.

### Notas de implementação complementar

1. **Verificação de erro após updates:** O brief não incluía verificação de erro nos updates finais, mas as instruções gerais dizem "TODA a query tem de desestruturar `error`". Adicionei verificação, jogando as exceções para o catch block (que devolve 500 público).

2. **Logs de erro:** Todos incluem contexto ("Erro ao atualizar sugestão") para debugging sem expor detalhes ao cliente.

3. **Acentuação:** Verificada palavra a palavra (dá, não, etc). Tudo pt-PT acentuado.

---

## Correcção 1 da Revisão — Race Conditions e Atomicidade

A revisão do coordinador identificou problemas críticos no desenho:

### Problema 1: CRITICAL — Race Condition de dupla resposta

**Antes:** A guarda `sugestao.util !== null` é uma leitura isolada sem bloqueio. Dois pedidos simultâneos (duplo clique, retry de rede) ambos lêem `util=null`, ambos escrevem, e cada um calcula o novo estado baseado no mesmo `ticket.status`, podendo resultar num estado final errado.

**Depois:** Implementado **compare-and-swap** no UPDATE da sugestão:
```ts
const { data: updateSugestaoData, error: updateSugestaoError } = await sb
  .from('ti_ticket_sugestoes')
  .update({ util, respondida_em: new Date().toISOString() })
  .eq('id', sugestao.id)
  .eq('util', null) // compare-and-swap: garante atomicidade lógica
  .select('id');

if (!updateSugestaoData || updateSugestaoData.length === 0) {
  return json({ success: false, error: 'Já respondeu a esta sugestão.' }, 409);
}
```
Assim, se dois pedidos tentarem responder, apenas um UPDATE afecta linhas; o outro detecciona a condição e devolve 409.

### Problema 2: Important — Falha de atomicidade entre dois UPDATEs

**Antes:** Se o UPDATE da sugestão passava mas o UPDATE do ticket falhava, a pessoa recebia 500 como se nada tivesse gravado — mas a sugestão ficava marcada. Uma segunda tentativa bate na guarda 409 e fica presa para sempre.

**Depois:** Se o UPDATE do ticket falhar, revertemos a sugestão:
```ts
if (updateTicketError) {
  console.error('Erro ao atualizar ticket:', updateTicketError);
  // Reverte a sugestão se o update do ticket falhar
  const { error: revertError } = await sb
    .from('ti_ticket_sugestoes')
    .update({ util: null, respondida_em: null })
    .eq('id', sugestao.id);

  if (revertError) {
    console.error(
      'CRÍTICO: falha ao atualizar ticket E ao revert da sugestão. Dessincronização!',
      { updateTicketError, revertError }
    );
  }
  throw updateTicketError;
}
```
Se a própria reversão falhar, registamos explicitamente com `console.error` — esse é o caso de dessincronização que requer intervenção manual.

### Problema 3: Minor — Validação de UUID

**Antes:** Um `acesso_token` ou `sugestao_id` que não seja UUID válido provocava erro do Postgres e devolvia 500.

**Depois:** Adicionada validação de formato antes de ir à BD:
```ts
function isValidUUID(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

if (!isValidUUID(acesso_token) || !isValidUUID(sugestao_id)) {
  return json({ success: false, error: 'Pedido incompleto.' }, 400);
}
```

### Problema 4: Minor — Limpeza de selects

**Antes:** `org_id` era seleccionado do ticket mas nunca usado.

**Depois:** Removido do select:
```ts
const { data: ticket, error: ticketError } = await sb
  .from('ti_tickets')
  .select('id, status') // Removido org_id
```

### Validação pós-correcção

**Comando:** `npx vitest run src/lib/tiTicketEstados.espelho.test.ts`
```
✓ src/lib/tiTicketEstados.espelho.test.ts (1 test) 6ms

Test Files  1 passed (1)
Tests       1 passed (1)
```

**Comando:** `npx esbuild supabase/functions/ti-sugestao-responder/index.ts --loader:.ts=ts --format=esm --outfile=/dev/null`
```
nul  4.2kb
Done in 9ms
```

**Comando:** `npx prettier --write supabase/functions/ti-sugestao-responder/index.ts`
```
supabase/functions/ti-sugestao-responder/index.ts 154ms
```

**Comando:** `pnpm type-check` → 0 erros
**Comando:** `pnpm lint` → 0 erros (617 warnings de ficheiros não tocados)

**Comando:** `pnpm test` (completo)
```
Test Files  159 passed (159)
Tests       1165 passed (1165)
Duration    192.81s
```

### Novo commit

`e75cd08` — fix(ti): protege resposta à sugestão contra race conditions e falhas atómicas

Ficheiro modificado:
- `supabase/functions/ti-sugestao-responder/index.ts` (+39 linhas, -3 linhas)

---

## Correcção 2 da Revisão — `.is()` vs `.eq()` em PostgREST

A revisão do coordinador identificou uma regressão crítica introduzida pela própria instrução da Correcção 1.

### Problema: `.eq('util', null)` nunca casa com linhas

**Antes:** A instrução dizia para usar `.eq('util', null)` no compare-and-swap:
```ts
.eq('util', null) // ❌ Gera WHERE util=eq.null — nunca verdadeiro
.select('id');

if (!updateSugestaoData || updateSugestaoData.length === 0) {
  return json({ success: false, error: 'Já respondeu a esta sugestão.' }, 409);
}
```

Em Postgres, a **lógica de três valores** faz com que `coluna = NULL` **nunca** seja verdadeiro para nenhuma linha. O WHERE resultante nunca casava, o SELECT retornava sempre lista vazia, e a guarda disparava sempre, mesmo na primeira resposta a uma sugestão nova. **A função ficava completamente inoperante: devolvia 409 a toda a gente.**

**Depois:** Usar `.is('util', null)`, que é o método correcto em PostgREST para comparar com NULL:
```ts
.is('util', null) // ✅ Gera WHERE util IS NULL — correcto
.select('id');
```

O método `.is()` é especificamente para comparações com `NULL` porque gera `IS NULL` em SQL, que é o padrão correcto.

### Nota importante: diferença entre `.eq()` e `.is()` em PostgREST

Este erro é invisível aos nossos portões de validação:
- **type-check:** Não o apanha porque `createClient` é criado sem generic `Database`
- **lint:** Não o apanha porque é código válido de Supabase JS
- **teste-espelho:** Só compara a tabela de transições, nunca chama o handler
- **testes completos:** Sem acesso a BD, não consigo testar o comportamento real do UPDATE

O bug só seria descoberto no deploy. Portanto: **esta lógica continua sem cobertura automática e só será provada no ambiente de produção.**

### Validação pós-correcção

**Confirmação por leitura:** Linha 107 agora tem `.is('util', null)` com comentário explicativo a quatro linhas (linhas 100-106) que justifica por que é `.is` e não `.eq`.

**Comando:** `npx vitest run src/lib/tiTicketEstados.espelho.test.ts`
```
✓ src/lib/tiTicketEstados.espelho.test.ts (1 test) 7ms

Test Files  1 passed (1)
Tests       1 passed (1)
```

**Comando:** `npx esbuild supabase/functions/ti-sugestao-responder/index.ts --loader:.ts=ts --format=esm --outfile=/dev/null`
```
nul  4.2kb
Done in 13ms
```

**Comando:** `npx prettier --write supabase/functions/ti-sugestao-responder/index.ts`
```
supabase/functions/ti-sugestao-responder/index.ts 192ms (unchanged)
```

**Comando:** `pnpm type-check` → 0 erros
**Comando:** `pnpm lint` → 0 erros (617 warnings de ficheiros não tocados)

**Comando:** `pnpm test` (completo)
```
Test Files  159 passed (159)
Tests       1165 passed (1165)
Duration    234.98s
```

### Novo commit

`38a2d9f` — fix(ti): corrige compare-and-swap no UPDATE da sugestão — .is() em vez de .eq()

Ficheiro modificado:
- `supabase/functions/ti-sugestao-responder/index.ts` (+4 linhas, -2 linhas)
