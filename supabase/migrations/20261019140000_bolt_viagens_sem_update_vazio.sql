-- O upsert do bolt-sync-semana reescreve cada viagem que já existe, incluindo o
-- dados_raw, mesmo quando nada mudou: lidera as escritas do pg_stat_statements
-- (261 943 blocos sujos em 1 137 chamadas). O PostgREST não deixa pôr WHERE no
-- ON CONFLICT DO UPDATE, por isso salta-se aqui: se só o updated_at difere, a
-- linha não é reescrita. Não há triggers AFTER UPDATE nesta tabela a depender disso.

CREATE OR REPLACE FUNCTION public.bolt_viagens_ignorar_update_sem_mudancas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
begin
  if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return null;
  end if;
  return new;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.bolt_viagens_ignorar_update_sem_mudancas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bolt_viagens_ignorar_update_sem_mudancas ON public.bolt_viagens;
CREATE TRIGGER bolt_viagens_ignorar_update_sem_mudancas
  BEFORE UPDATE ON public.bolt_viagens
  FOR EACH ROW EXECUTE FUNCTION public.bolt_viagens_ignorar_update_sem_mudancas();

NOTIFY pgrst, 'reload schema';
