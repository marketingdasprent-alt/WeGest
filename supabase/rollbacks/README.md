# Rollbacks

Ficheiros SQL de reversão. **Não são migrações e não devem estar em
`supabase/migrations/`**: a pasta de migrações é aplicada por ordem, portanto um
rollback ali seria executado logo a seguir à migração que reverte — desfazendo-a
num `supabase db push` ou num clone novo.

Aplicar à mão, e só depois de decidir que é isso que se quer:

```sh
psql "$DATABASE_URL" -f supabase/rollbacks/<ficheiro>.sql
```

## Ficheiros

- `20260730084228_rollback_isolamento_anon.sql` — reverte
  `20260730084227_isolamento_anon_causa_raiz.sql`. Repõe os grants largos de
  `anon` e a política de inserção de leads sem restrição de organização. Não é
  um estado bom; é o estado anterior.

Nota: as restantes migrações de segurança de 2026-07-30 não têm ficheiro de
rollback de propósito — seria um script pronto a correr que reabre um buraco.
Os comandos de reversão estão em comentário no topo de cada uma:

- `20260730083944_fix_escalada_privilegios_anon` — escalada de privilégios
- `20260730084755_fix_lead_anon_politica_encadeada` — regressão do insert de leads
- `20260730085024_leads_anon_org_default` — regressão do org_id dos leads
- `20260730090840_revoke_execute_anon_funcoes` — EXECUTE anónimo nas funções
- `20260730091152_org_codigo_sem_enumeracao` — enumeração dos códigos de org
