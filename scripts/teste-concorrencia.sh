#!/usr/bin/env bash
#
# Dois workers a competir pelo mesmo lote de eventos.
#
# ── PORQUE ISTO NÃO É UM FICHEIRO pgTAP ─────────────────────────────────────
#
# Todos os testes pgTAP deste repositório correm dentro de `begin ... rollback`.
# Uma segunda ligação — dblink ou outra — não vê fixtures por confirmar,
# portanto reclamaria de uma base vazia e o teste passaria sem testar nada.
#
# Concorrência a sério exige dados COMMITADOS e dois processos separados. Daí
# este script: cria o cenário, confirma-o, lança dois `psql` ao mesmo tempo,
# compara o que cada um reclamou, e limpa.
#
# ── O QUE PROVA ─────────────────────────────────────────────────────────────
#
#   nenhum evento é reclamado pelos dois workers
#   a soma dos dois é igual ao total, sem perdas
#
# É a lacuna que as Fases 1 a 4 deixaram marcada como INFERIDO: o
# `for update skip locked` estava certo por leitura, nunca por observação.
#
# Uso:  bash scripts/teste-concorrencia.sh [URL_DA_BASE]

set -uo pipefail

BD="${1:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
N_EVENTOS=40
ORG='00000000-0000-0000-0000-0000000cc000'
REGRA='00000000-0000-0000-0000-0000004cc000'
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v psql >/dev/null 2>&1 || { echo "❌ psql não encontrado."; exit 1; }

echo "═══ Concorrência: dois workers, $N_EVENTOS eventos ═══"

limpar() {
  psql "$BD" -q -v ON_ERROR_STOP=1 <<SQL >/dev/null 2>&1
    delete from public.automation_runs where org_id = '$ORG';
    delete from public.automation_logs where org_id = '$ORG';
    delete from public.domain_events   where org_id = '$ORG';
    delete from public.automation_rules where org_id = '$ORG';
    delete from public.organizacoes    where id     = '$ORG';
SQL
}

limpar

# ── Cenário, confirmado ─────────────────────────────────────────────────────
# Sem regra que case: o que está em teste é o claim, não o que vem depois.
# Assim o `process_domain_events` não interfere e o lote fica limpo.
psql "$BD" -q -v ON_ERROR_STOP=1 <<SQL || { echo "❌ falhou a montar o cenário"; exit 1; }
  insert into public.organizacoes (id, nome, codigo)
  values ('$ORG', 'Org Concorrencia', 'concorrencia-teste');

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, emitted_by, occurred_at)
  select '$ORG', 'teste.concorrencia', 'viaturas', gen_random_uuid(), 'manual', now() - interval '1 minute'
  from generate_series(1, $N_EVENTOS);
SQL

# ── Dois workers ao mesmo tempo ─────────────────────────────────────────────
# `--single-transaction` não: cada um faz o seu claim e confirma, que é o que
# dois workers reais fazem.
reclamar() {
  psql "$BD" -q -t -A -v ON_ERROR_STOP=1 \
    -c "select id from public.domain_events_claim($N_EVENTOS) where org_id = '$ORG';" \
    > "$TMP/worker_$1.txt" 2>"$TMP/erro_$1.txt"
}

reclamar a &
PID_A=$!
reclamar b &
PID_B=$!
wait $PID_A; ST_A=$?
wait $PID_B; ST_B=$?

if [ $ST_A -ne 0 ] || [ $ST_B -ne 0 ]; then
  echo "❌ um dos workers falhou:"
  cat "$TMP/erro_a.txt" "$TMP/erro_b.txt" | sed 's/^/    /'
  limpar
  exit 1
fi

sort -u "$TMP/worker_a.txt" | grep -c . > "$TMP/na" || true
sort -u "$TMP/worker_b.txt" | grep -c . > "$TMP/nb" || true
NA=$(cat "$TMP/na"); NB=$(cat "$TMP/nb")
SOBREPOSTOS=$(comm -12 <(sort -u "$TMP/worker_a.txt") <(sort -u "$TMP/worker_b.txt") | grep -c . || true)
TOTAL=$(( NA + NB ))

echo "  worker A reclamou: $NA"
echo "  worker B reclamou: $NB"
echo "  reclamados pelos dois: $SOBREPOSTOS"
echo "  total: $TOTAL de $N_EVENTOS"

FALHOU=0

if [ "$SOBREPOSTOS" -ne 0 ]; then
  echo "❌ $SOBREPOSTOS evento(s) reclamados pelos DOIS workers — o skip locked não protegeu."
  FALHOU=1
else
  echo "✓ nenhum evento foi reclamado pelos dois"
fi

# A soma tem de bater certo: um evento que nenhum reclamou seria uma perda
# silenciosa, que é tão mau como uma duplicação.
if [ "$TOTAL" -ne "$N_EVENTOS" ]; then
  echo "❌ $TOTAL reclamados de $N_EVENTOS — há eventos por reclamar."
  FALHOU=1
else
  echo "✓ os $N_EVENTOS eventos foram reclamados, sem perdas"
fi

limpar

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### 🔀 Concorrência"
    echo ""
    if [ "$FALHOU" -eq 0 ]; then
      echo "✅ Dois workers, $N_EVENTOS eventos: $NA + $NB, zero sobreposições."
    else
      echo "❌ $SOBREPOSTOS sobreposições, $TOTAL de $N_EVENTOS reclamados."
    fi
    echo ""
  } >> "$GITHUB_STEP_SUMMARY"
fi

exit $FALHOU
