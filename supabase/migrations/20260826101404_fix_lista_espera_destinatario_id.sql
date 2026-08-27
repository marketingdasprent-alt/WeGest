-- ============================================================
-- Lista de espera: avisos criados de 5 em 5 minutos que ninguém podia ver
-- ============================================================
-- verificar_lista_espera_disponibilidade() (cron `lista-espera-disponibilidade`,
-- */5 * * * *, ACTIVO em produção) insere em `notificacoes.destinatario_user_id`.
-- A policy de SELECT em vigor exige, para o tipo 'viatura_disponivel',
-- `destinatario_id = auth.uid()`. São COLUNAS DIFERENTES.
--
-- A linha é criada e nunca é devolvida a ninguém — nem ao gestor a quem se
-- dirige. E como o guard anti-duplicação da própria função procura um aviso
-- ainda por resolver para aquela entrada, encontra sempre a linha invisível e
-- desiste: depois do primeiro aviso perdido, aquela entrada da lista de espera
-- nunca mais gera outro. O bloqueio é permanente.
--
-- COMO ISTO ACONTECEU
-- Em 20260626000000 a coluna nova chamava-se `destinatario_user_id`. Três dias
-- depois, 20260629000004 introduziu `destinatario_id` e passou a policy e o
-- trigger notificar_lista_espera_viatura() para essa. Esta função ficou para
-- trás. A migração 20260707140000 chega a documentar em comentário que
-- "destinatario_user_id foi substituída" — mas ninguém voltou aqui.
--
-- VERIFICADO EM PRODUÇÃO (2026-08-26)
--   linhas com destinatario_user_id preenchido e destinatario_id NULL:  7
--   prosrc da função ainda contém 'destinatario_user_id':            true
--
-- O QUE ESTA MIGRAÇÃO NÃO DECIDE
-- Existem DOIS mecanismos a produzir 'viatura_disponivel': este cron (varre a
-- lista de espera e usa a definição rica de "totalmente livre") e o trigger
-- notificar_lista_espera_viatura() em viaturas.status. Detectam coisas
-- diferentes e sobrepõem-se. Escolher um é uma decisão de produto e fica de
-- fora: aqui só se corrige o facto de um deles escrever para o vazio.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Recuperar as linhas órfãs
-- ------------------------------------------------------------
-- Avisos reais, dirigidos a pessoas reais, que nunca chegaram a ser vistos.
-- Copiar a coluna torna-os visíveis ao destinatário a que sempre pertenceram.
update public.notificacoes
set destinatario_id = destinatario_user_id
where destinatario_user_id is not null
  and destinatario_id is null;

-- ------------------------------------------------------------
-- 2. A função passa a escrever na coluna viva
-- ------------------------------------------------------------
create or replace function public.verificar_lista_espera_disponibilidade()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrada record;
  v_matricula_livre text;
  v_criadas integer := 0;
begin
  for v_entrada in
    select id, titulo, criado_por, org_id
    from public.calendario_eventos
    where tipo = 'lista_espera'
      and titulo is not null
      and criado_por is not null
  loop
    -- Já existe aviso por resolver para esta entrada? Não duplicar.
    --
    -- O ramo `notificacao_dispensas` que aqui estava foi retirado: essa tabela
    -- deixou de ter escritores em 20260629000004, quando resolver_notificacao()
    -- voltou a marcar `resolvida = true` em vez de gravar uma dispensa pessoal.
    -- Estava permanentemente vazia, pelo que o `NOT EXISTS` era sempre
    -- verdadeiro e o sub-select só dava a impressão de haver ali uma regra.
    if exists (
      select 1 from public.notificacoes n
      where n.evento_id = v_entrada.id
        and n.tipo = 'viatura_disponivel'
        and n.resolvida = false
    ) then
      continue;
    end if;

    -- Procurar uma viatura da marca+modelo desejada que esteja totalmente
    -- livre. O titulo é "marca modelo" (ex.: "Tesla Model 3"); compara-se sem
    -- diferenças de maiúsculas e colapsando espaços. Restringe à org da
    -- entrada (multi-tenant): só viaturas da mesma org contam.
    select v.matricula into v_matricula_livre
    from public.viaturas v
    where v.is_vendida is not true
      and (v_entrada.org_id is null or v.org_id = v_entrada.org_id)
      and lower(regexp_replace(btrim(v.marca || ' ' || v.modelo), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(v_entrada.titulo), '\s+', ' ', 'g'))
      and public.viatura_totalmente_livre(v.id)
    limit 1;

    if v_matricula_livre is not null then
      insert into public.notificacoes (
        org_id, tipo, evento_id, destinatario_id, titulo, mensagem, severidade, link
      )
      values (
        v_entrada.org_id,
        'viatura_disponivel',
        v_entrada.id,
        -- `destinatario_id`, não `destinatario_user_id`: é esta a coluna que a
        -- policy de SELECT lê e que resolver_notificacao() consulta.
        v_entrada.criado_por,
        'Viatura disponível: ' || v_entrada.titulo,
        'Já existe uma ' || v_entrada.titulo || ' disponível (' || v_matricula_livre ||
          '). Pode avançar com a reserva da lista de espera.',
        'normal',
        '/calendario'
      );
      v_criadas := v_criadas + 1;
    end if;
  end loop;

  return v_criadas;
end;
$$;

-- Sem GRANT a `authenticated`: só o cron (owner) a executa. Evita que um
-- utilizador qualquer force a criação antecipada de avisos a outros gestores.
revoke execute on function public.verificar_lista_espera_disponibilidade() from anon, authenticated;
