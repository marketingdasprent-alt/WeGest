-- handle_new_user_org() existia nas migrações, mas o CREATE TRIGGER que a
-- liga a auth.users nunca foi capturado em nenhum ficheiro — só existia em
-- produção, aplicado à mão nalgum momento. Uma base de dados fresca (CI, dev
-- local) não disparava nada ao criar um utilizador. Descoberto pelo pgTAP
-- signup_nao_confia_na_metadata: é o primeiro teste promovido a depender
-- deste trigger disparar sozinho.

drop trigger if exists on_auth_user_created_org on auth.users;

create trigger on_auth_user_created_org
  after insert on auth.users
  for each row execute function public.handle_new_user_org();
