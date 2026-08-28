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
