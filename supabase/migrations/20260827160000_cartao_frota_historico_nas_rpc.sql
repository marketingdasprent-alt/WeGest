-- ============================================================
-- Registar o histórico de atribuições dentro das RPC dos cartões
-- ============================================================
-- PROBLEMA
-- 20260826131640 passou atribuir/devolver para RPC atómicas, mas essas RPC não
-- escrevem em `cartao_atribuicoes`. As escritas viviam no cliente
-- (MotoristaCartoesFrota) e desapareceram com ele. Nada mais as faz: os dois
-- triggers dessa tabela (`atribuicao_alterada`, `marcar_refecho`) reagem a
-- linhas que já lá estão, não as criam.
--
-- CONSEQUÊNCIA
-- `cartao_atribuicoes` é a fonte de verdade para imputar combustível
-- (20260825120000). Sem período registado, o consumo de um cartão atribuído
-- depois desta data entra por atribuir — em silêncio, e só se nota no fecho de
-- contas, quando os totais não batem certo.
--
-- PORQUE O NOVO PERÍODO PODE NÃO COMEÇAR HOJE
-- `cartao_atribuicoes_sem_sobreposicao` é um EXCLUDE sobre
-- `daterange(de, coalesce(ate, 'infinity'), '[]')` — intervalo fechado dos DOIS
-- lados. Um cartão que muda de mãos no mesmo dia (A devolve, B recebe) teria o
-- dia da entrega nos dois períodos e violaria a restrição. Como agora isto
-- corre dentro da transacção da atribuição, essa violação já não daria um aviso
-- — abortava a atribuição inteira.
--
-- A regra: o dia da entrega conta para quem entregou, e quem recebe começa no
-- dia seguinte. É a escolha conservadora — mantém intacto o período de quem já
-- lá estava, em vez de lhe tirar um dia de consumo à conta de um cartão que
-- entretanto mudou de mãos.
--
-- O QUE NÃO MUDA
-- Assinaturas, autorização, isolamento por organização e o resto do corpo das
-- funções são os de 20260826131640. `sincronizar_ficha_cartao_frota` não mexe
-- em atribuições e fica como está.

-- ------------------------------------------------------------
-- Atribuir
-- ------------------------------------------------------------
create or replace function public.atribuir_cartao_frota(
  p_cartao_id uuid,
  p_motorista_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_tipo   text;
  v_numero text;
  v_de     date;
begin
  v_org := get_current_org_id();
  if v_org is null then
    raise exception 'Sem organização activa';
  end if;

  if not (
    is_current_user_admin()
    or has_permission(auth.uid(), 'administrativo_cartoes', 'editar')
  ) then
    raise exception 'Sem permissão para gerir cartões de frota';
  end if;

  -- Trava a linha: sem isto, duas atribuições concorrentes do mesmo cartão
  -- passavam ambas e a última ganhava, sem ninguém saber.
  select tipo, numero into v_tipo, v_numero
  from public.cartoes_frota
  where id = p_cartao_id and org_id = v_org
  for update;

  if not found then
    raise exception 'Cartão inexistente ou de outra organização';
  end if;

  if v_tipo not in ('bp', 'repsol', 'edp') then
    raise exception 'Tipo de cartão desconhecido: %', v_tipo;
  end if;

  if not exists (
    select 1 from public.motoristas_ativos
    where id = p_motorista_id and org_id = v_org
  ) then
    raise exception 'Motorista inexistente ou de outra organização';
  end if;

  update public.cartoes_frota
  set motorista_id = p_motorista_id,
      status       = 'em_uso',
      data_entrega = current_date
  where id = p_cartao_id and org_id = v_org;

  update public.motoristas_ativos
  set cartao_bp     = case when v_tipo = 'bp'     then v_numero else cartao_bp end,
      cartao_repsol = case when v_tipo = 'repsol' then v_numero else cartao_repsol end,
      cartao_edp    = case when v_tipo = 'edp'    then v_numero else cartao_edp end
  where id = p_motorista_id and org_id = v_org;

  -- Fecha o que tenha ficado aberto. Em condições normais devolver já o fechou;
  -- isto cobre cartões atribuídos por caminhos antigos e o backfill.
  update public.cartao_atribuicoes
  set ate = current_date
  where cartao_id = p_cartao_id
    and org_id = v_org
    and ate is null;

  -- Começa hoje, ou no dia a seguir ao último período fechado se este cartão já
  -- mudou de mãos hoje. Ver a nota do EXCLUDE no cabeçalho.
  select greatest(coalesce(max(ate) + 1, current_date), current_date) into v_de
  from public.cartao_atribuicoes
  where cartao_id = p_cartao_id and org_id = v_org;

  insert into public.cartao_atribuicoes
    (org_id, cartao_id, motorista_id, de, origem, criado_por)
  values
    (v_org, p_cartao_id, p_motorista_id, v_de, 'associacao', auth.uid());
end;
$$;

comment on function public.atribuir_cartao_frota(uuid, uuid) is
  'Atribui um cartão de frota a um motorista: marca o cartão em uso, grava o número na ficha (cartao_<tipo>) E abre o período em cartao_atribuicoes, numa só transacção. tipo/número vêm do cartão, não do cliente.';

-- ------------------------------------------------------------
-- Devolver
-- ------------------------------------------------------------
create or replace function public.devolver_cartao_frota(p_cartao_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_tipo      text;
  v_numero    text;
  v_motorista uuid;
begin
  v_org := get_current_org_id();
  if v_org is null then
    raise exception 'Sem organização activa';
  end if;

  if not (
    is_current_user_admin()
    or has_permission(auth.uid(), 'administrativo_cartoes', 'editar')
  ) then
    raise exception 'Sem permissão para gerir cartões de frota';
  end if;

  select tipo, numero, motorista_id into v_tipo, v_numero, v_motorista
  from public.cartoes_frota
  where id = p_cartao_id and org_id = v_org
  for update;

  if not found then
    raise exception 'Cartão inexistente ou de outra organização';
  end if;

  update public.cartoes_frota
  set motorista_id        = null,
      ultimo_motorista_id = v_motorista,
      status              = 'disponivel',
      data_devolucao      = current_date
  where id = p_cartao_id and org_id = v_org;

  -- A ficha só é limpa se apontava mesmo para ESTE cartão. Se o gestor já lá
  -- tinha posto outro número à mão, devolver este não pode apagá-lo.
  -- (btrim: a comparação que o frontend fazia era `.trim()` dos dois lados.)
  if v_motorista is not null then
    update public.motoristas_ativos
    set cartao_bp = case
          when v_tipo = 'bp' and btrim(coalesce(cartao_bp, '')) = btrim(v_numero)
          then null else cartao_bp end,
        cartao_repsol = case
          when v_tipo = 'repsol' and btrim(coalesce(cartao_repsol, '')) = btrim(v_numero)
          then null else cartao_repsol end,
        cartao_edp = case
          when v_tipo = 'edp' and btrim(coalesce(cartao_edp, '')) = btrim(v_numero)
          then null else cartao_edp end
    where id = v_motorista and org_id = v_org;
  end if;

  -- Um período que ainda nem tinha começado não se fecha: apaga-se, porque não
  -- chegou a existir. Fechá-lo com `ate` anterior a `de` violaria
  -- cartao_atribuicoes_periodo_valido e abortava a devolução.
  delete from public.cartao_atribuicoes
  where cartao_id = p_cartao_id
    and org_id = v_org
    and ate is null
    and de > current_date;

  -- Fecha o período. O que ele gastou até hoje continua dele — devolver um
  -- cartão não reescreve o passado.
  update public.cartao_atribuicoes
  set ate = current_date
  where cartao_id = p_cartao_id
    and org_id = v_org
    and ate is null;
end;
$$;

comment on function public.devolver_cartao_frota(uuid) is
  'Devolve um cartão de frota: liberta o cartão, guarda quem o tinha em ultimo_motorista_id, limpa a ficha do motorista se ela apontava para este número E fecha o período em cartao_atribuicoes — numa só transacção.';

-- ------------------------------------------------------------
-- Grants: `create or replace` mantém-nos, mas repetir aqui deixa a migração
-- correcta se for aplicada isolada.
-- ------------------------------------------------------------
revoke all on function public.atribuir_cartao_frota(uuid, uuid) from public, anon;
revoke all on function public.devolver_cartao_frota(uuid) from public, anon;
grant execute on function public.atribuir_cartao_frota(uuid, uuid) to authenticated;
grant execute on function public.devolver_cartao_frota(uuid) to authenticated;
