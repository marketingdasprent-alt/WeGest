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

## Acrescentadas depois do cutover (2026-08-28)

Quatro migrações que estavam aplicadas em produção **sem ficheiro no git** e só
foram recuperadas depois do baseline já estar gerado:

    20260824093459_teste_permissao_ddl_noop
    20260824094547_vigia_cron_edge_so_falha_sustentada
    20260824154335_bolt_csv_sem_metricas_atividade_mensagens
    20260827151938_ti_tickets_numero_global

Vêm para aqui, e não para `supabase/migrations/`, porque o **baseline já contém
os efeitos delas** — foram aplicadas a produção antes do dump. Deixá-las activas
fá-las-ia correr outra vez sobre um schema que já as tem. São idempotentes, logo
não partiriam nada, mas estariam a dizer que fazem parte do caminho de
construção quando não fazem.

Ficam versionadas por outra razão: sem elas, o detector de deriva
(`scripts/verificar-migracoes.mjs`) acusa produção de ter migrações sem ficheiro
— que era exactamente o problema que este trabalho veio fechar.
