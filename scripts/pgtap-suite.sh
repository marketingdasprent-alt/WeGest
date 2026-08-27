#!/usr/bin/env bash
#
# Corre um conjunto de ficheiros pgTAP e falha se algum falhar.
#
# Existe por duas razões, ambas práticas:
#
#   1. `supabase test db a.sql b.sql c.sql` pára no primeiro erro e a saída não
#      diz com clareza quantos ficheiros chegaram a correr. Um a um, sabe-se
#      sempre o estado de cada um — incluindo os que passaram depois do que
#      falhou.
#   2. O resumo por ficheiro aparece no separador Summary do GitHub Actions, o
#      que evita ter de abrir os logs para saber o que se partiu.
#
# Uso:
#   bash scripts/pgtap-suite.sh "<nome do conjunto>" <teste> [<teste>...]
#
# Os nomes dos testes são o basename sem `.test.sql`:
#   bash scripts/pgtap-suite.sh "Motor" process_domain_events execute_automation_runs
#
# Exit code 0 se todos passarem, 1 se algum falhar.

set -uo pipefail

CONJUNTO="${1:?falta o nome do conjunto}"
shift
[ "$#" -gt 0 ] || { echo "❌ Nenhum teste indicado para '$CONJUNTO'."; exit 1; }

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR_TESTES="$RAIZ/supabase/tests"

command -v supabase >/dev/null 2>&1 || { echo "❌ supabase CLI não encontrado."; exit 1; }

passaram=0
falharam=0
falhados=()

echo "═══ $CONJUNTO — $# ficheiro(s) ═══"

for nome in "$@"; do
  ficheiro="$DIR_TESTES/${nome}.test.sql"

  # Um teste que desapareceu é uma falha, não um salto silencioso: renomear um
  # ficheiro sem actualizar esta lista deixaria o gate a passar sem correr nada.
  if [ ! -f "$ficheiro" ]; then
    echo "✗ $nome — FICHEIRO NÃO EXISTE ($ficheiro)"
    falhados+=("$nome (ausente)")
    falharam=$((falharam + 1))
    continue
  fi

  # `if cmd; then` em vez de guardar e testar `$?`: com a atribuição pelo meio
  # é fácil alguém acrescentar uma linha entre as duas e ficar a testar o
  # estado da linha errada. Aqui não há espaço para isso acontecer.
  if saida="$(supabase test db "$ficheiro" 2>&1)"; then
    echo "✓ $nome"
    passaram=$((passaram + 1))
  else
    echo "✗ $nome"
    echo "$saida" | sed 's/^/    /'
    falhados+=("$nome")
    falharam=$((falharam + 1))
  fi
done

# Resumo no painel do GitHub Actions, quando lá estamos.
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### $CONJUNTO"
    echo ""
    if [ "$falharam" -eq 0 ]; then
      echo "✅ $passaram/$# ficheiros passaram."
    else
      echo "❌ $falharam de $# ficheiros falharam:"
      echo ""
      for f in "${falhados[@]}"; do echo "- \`$f\`"; done
    fi
    echo ""
  } >> "$GITHUB_STEP_SUMMARY"
fi

echo "─── $CONJUNTO: $passaram passaram, $falharam falharam ───"
[ "$falharam" -eq 0 ]
