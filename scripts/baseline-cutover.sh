#!/usr/bin/env bash
#
# ============================================================================
# Cutover para baseline — torna a cadeia de migrações reconstruível
# ============================================================================
#
# PORQUÊ ISTO EXISTE
#
# A 2026-08-28 o repositório tinha 800 ficheiros de migração e produção tinha
# 523 versões registadas. Duas causas independentes impediam
# `supabase db reset` de reproduzir produção:
#
#   1. 59 carimbos de versão DUPLICADOS entre ficheiros (um deles partilhado
#      por 10 ficheiros). `supabase_migrations.schema_migrations` tem
#      PRIMARY KEY (version): o segundo ficheiro com o mesmo carimbo aborta o
#      reset com violação de chave primária.
#
#   2. ~280 migrações no repositório nunca foram registadas em produção —
#      foram escritas contra uma base de dados que já tinha o estado. Aplicá-las
#      de zero falha (ex.: o backfill de 2025-08-11 que referencia
#      `leads_dasprent.formulario_id`, coluna que nenhuma migração cria).
#
# Nenhuma das duas se resolve reparando ficheiro a ficheiro em tempo útil. A
# saída padrão para uma base nesta situação é um BASELINE: um retrato do schema
# vivo como ponto de partida único, com a história anterior arquivada.
#
# O QUE ESTE SCRIPT FAZ
#
#   1. Verifica pré-requisitos (supabase CLI, ligação à base).
#   2. Gera `supabase/migrations/00000000000000_baseline.sql` a partir do schema
#      REAL de produção, via `supabase db dump` — a ferramenta oficial, não um
#      dump montado à mão.
#   3. Move os 800 ficheiros históricos para `supabase/migrations_archive/`,
#      onde o CLI não lhes toca mas continuam no git para consulta.
#   4. Reconstrói uma base local a partir do resultado e confirma que arranca.
#
# O passo 3 só acontece se o passo 2 produzir um ficheiro não-vazio. Nunca fica
# um estado intermédio em que o repositório não tem migrações nenhumas.
#
# COMO CORRER
#
#   export SUPABASE_DB_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres'
#   bash scripts/baseline-cutover.sh
#
# A password está em Supabase Dashboard → Project Settings → Database.
# NUNCA a coloques num ficheiro versionado.
#
# DEPOIS DE CORRER
#
#   git add -A supabase/migrations supabase/migrations_archive
#   git commit -m "chore(db): baseline do schema e arquivo do histórico"
#
# e confirma que o job "🗄️ DB Rebuild + pgTAP" do CI fica verde.
# ============================================================================

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRACOES="$RAIZ/supabase/migrations"
ARQUIVO="$RAIZ/supabase/migrations_archive"
BASELINE="$MIGRACOES/00000000000000_baseline.sql"

erro() { echo "❌ $*" >&2; exit 1; }
passo() { echo; echo "── $* ────────────────────────────────────────"; }

# ── 1. Pré-requisitos ───────────────────────────────────────────
passo "1/4 · Pré-requisitos"

command -v supabase >/dev/null 2>&1 \
  || erro "Supabase CLI não encontrado. Instala com: npm i -g supabase (ou brew install supabase/tap/supabase)"

[ -n "${SUPABASE_DB_URL:-}" ] \
  || erro "SUPABASE_DB_URL não definida. Ver o cabeçalho deste ficheiro."

[ -d "$MIGRACOES" ] || erro "Não encontrei $MIGRACOES"

if [ -f "$BASELINE" ]; then
  erro "$BASELINE já existe. O cutover já foi feito — apaga-o à mão se queres refazê-lo."
fi

N_ANTES=$(find "$MIGRACOES" -maxdepth 1 -name '*.sql' -type f | wc -l | tr -d ' ')
echo "✓ supabase CLI: $(supabase --version 2>&1 | head -1)"
echo "✓ ficheiros de migração actuais: $N_ANTES"

# ── 2. Gerar o baseline ─────────────────────────────────────────
passo "2/4 · Retrato do schema de produção"

TMP_BASELINE="$(mktemp)"
trap 'rm -f "$TMP_BASELINE"' EXIT

echo "A correr supabase db dump (só schema, sem dados)…"
supabase db dump --db-url "$SUPABASE_DB_URL" --schema public -f "$TMP_BASELINE" \
  || erro "supabase db dump falhou. Confirma a SUPABASE_DB_URL e o acesso à rede."

# Um dump vazio ou minúsculo significa que algo correu mal em silêncio — e
# arquivar 800 ficheiros com base nele seria destruir a única cópia da verdade.
LINHAS=$(wc -l < "$TMP_BASELINE" | tr -d ' ')
[ "$LINHAS" -gt 500 ] \
  || erro "O dump tem apenas $LINHAS linhas — demasiado pequeno para ser o schema real. Nada foi arquivado."

grep -q 'CREATE TABLE' "$TMP_BASELINE" \
  || erro "O dump não contém nenhum CREATE TABLE. Nada foi arquivado."

{
  cat <<'CABECALHO'
-- ============================================================================
-- BASELINE — retrato do schema de produção
-- ============================================================================
--
-- Gerado por scripts/baseline-cutover.sh com `supabase db dump`.
--
-- ── EXTENSÕES ───────────────────────────────────────────────────────────────
-- `supabase db dump --schema public` traz só o schema `public`. As extensões
-- vivem noutros schemas e NÃO vêm no dump — mas o `public` depende delas.
--
-- Descoberto a 2026-08-28, na primeira execução real deste script: a view
-- `public.cron_edge_health` faz `LEFT JOIN net._http_response`, o schema `net`
-- é criado pela extensão `pg_net`, e numa base acabada de nascer não existe.
-- O reset abortava na instrução 1060 com
-- `relation "net._http_response" does not exist`.
--
-- Por isso o baseline começa por recriar as extensões que produção tem, ANTES
-- do dump. `IF NOT EXISTS` em todas: o stack local do Supabase já cria algumas
-- (vault, pg_stat_statements) e recriá-las seria um erro.
CABECALHO

  cat <<'EXTENSOES'

-- Schema onde o Supabase aloja as extensões. Já existe no stack local, mas uma
-- base Postgres nua não o tem.
create schema if not exists extensions;

create extension if not exists "pg_net"             with schema extensions;
create extension if not exists "pgcrypto"           with schema extensions;
create extension if not exists "uuid-ossp"          with schema extensions;
create extension if not exists "pg_stat_statements" with schema extensions;

-- Estas três estão em `public` em produção, e o código conta com isso:
-- `unaccent()` e `show_trgm()` são chamadas sem qualificar, e `btree_gist`
-- suporta as constraints de exclusão que impedem sobreposição de atribuições
-- de viatura a motorista.
create extension if not exists "pg_trgm"    with schema public;
create extension if not exists "unaccent"   with schema public;
create extension if not exists "btree_gist" with schema public;

-- pg_cron vive em pg_catalog e só pode ser criada na base indicada em
-- cron.database_name (localmente, `postgres`). Se falhar num ambiente que não
-- a suporte, o resto do baseline continua a ser válido — o que se perde são os
-- trabalhos agendados, que de qualquer forma não vêm neste dump (ver a nota
-- sobre o schema `cron` em docs/motor-automacao/reconstrucao-migracoes.md).
create extension if not exists "pg_cron";

EXTENSOES

  cat <<'CABECALHO'
-- ── O QUE ISTO SUBSTITUI ────────────────────────────────────────────────────
--
-- Este ficheiro SUBSTITUI a cadeia histórica de migrações como ponto de partida
-- de qualquer base de dados nova. Os ficheiros anteriores estão em
-- `supabase/migrations_archive/` — continuam no git para consulta e para
-- arqueologia, mas o CLI já não lhes toca.
--
-- NÃO EDITAR À MÃO. Para mudar o schema, cria uma migração nova a seguir a
-- esta. Para regenerar o baseline (raro — só faz sentido depois de outra
-- divergência grande), apaga este ficheiro e volta a correr o script.
--
-- Ver docs/motor-automacao/reconstrucao-migracoes.md.
-- ============================================================================

CABECALHO
  cat "$TMP_BASELINE"
} > "$BASELINE"

echo "✓ baseline escrito: $(wc -l < "$BASELINE" | tr -d ' ') linhas"

# ── 3. Arquivar o histórico ─────────────────────────────────────
passo "3/4 · Arquivo do histórico"

mkdir -p "$ARQUIVO"
N_MOVIDOS=0

while IFS= read -r f; do
  [ "$f" = "$BASELINE" ] && continue
  if git -C "$RAIZ" ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    git -C "$RAIZ" mv "$f" "$ARQUIVO/" 2>/dev/null || mv "$f" "$ARQUIVO/"
  else
    mv "$f" "$ARQUIVO/"
  fi
  N_MOVIDOS=$((N_MOVIDOS + 1))
done < <(find "$MIGRACOES" -maxdepth 1 -name '*.sql' -type f)

cat > "$ARQUIVO/README.md" <<'ARQ'
# Migrações históricas (arquivadas)

Ficheiros aplicados a produção entre 2024-06 e 2026-08-27, retirados do caminho
do Supabase CLI no cutover para baseline de 2026-08-28.

**Não são aplicados a nenhuma base de dados.** O ponto de partida é
`supabase/migrations/00000000000000_baseline.sql`.

Estão aqui por duas razões: o *porquê* de muitas decisões só existe nos
comentários destes ficheiros, e várias investigações de incidentes começaram
por os ler.

Duas coisas a saber antes de confiar neles:

- **59 carimbos de versão estão duplicados** entre ficheiros. A ordem em que
  foram realmente aplicados não é recuperável a partir dos nomes.
- **~280 destes ficheiros nunca foram registados** em
  `supabase_migrations.schema_migrations` de produção. Foram escritos contra uma
  base que já tinha o estado, e não se aplicam de zero.

Ou seja: leem-se como documentação, não como fonte de verdade do schema.
ARQ

echo "✓ $N_MOVIDOS ficheiros movidos para supabase/migrations_archive/"

# ── 4. Verificar ────────────────────────────────────────────────
passo "4/4 · Verificação: reconstruir do zero"

if ! docker info >/dev/null 2>&1; then
  echo "⚠️  Docker não está disponível — o baseline foi escrito mas NÃO foi verificado."
  echo
  echo "    Isto não é um problema se estiveres a correr isto localmente sem Docker:"
  echo "    o workflow 🧱 Gerar baseline do schema faz o mesmo num runner do GitHub,"
  echo "    que tem Docker, e só empurra o resultado depois de o verificar."
  echo
  echo "    Actions → 🧱 Gerar baseline do schema → Run workflow"
  exit 0
fi

# `db start` (e não `db reset`) porque é o que arranca a base de raiz aplicando
# a cadeia toda — é o comando que o workflow rls-test.yml já usava e que
# demonstrou funcionar neste projecto. Deixa a base A CORRER de propósito: os
# passos seguintes do workflow correm o pgTAP contra ela.
echo "A reconstruir a base do zero a partir do baseline…"
if supabase db start; then
  echo
  echo "✅ Cutover concluído e verificado."
  echo "   $N_ANTES ficheiros → 1 baseline + $N_MOVIDOS arquivados"
  echo
  echo "   A base ficou a correr. Próximo passo:"
  echo "     bash scripts/pgtap-suite.sh \"Motor\" process_domain_events execute_automation_runs"
else
  erro "A reconstrução falhou com o baseline. O baseline está escrito e o histórico arquivado — investiga antes de commitar."
fi
