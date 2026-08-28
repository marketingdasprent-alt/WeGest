-- ============================================================
-- Faturar em nome do motorista (TVDE)
-- ============================================================
-- SINTOMA: no diálogo de faturação, escolher "Motorista" (ou "Condutor")
-- não mudava nada — a factura saía sempre com o NIF da empresa titular do
-- contrato. Confirmado nos dados: as 15 facturas mais recentes tinham todas
-- destinatario_papel='cliente'.
--
-- CAUSA: era intencional. O destinatário fiscal estava fixo no titular e ao
-- motorista só se cedia a dívida interna (ver 20260730170000). Decisão
-- revista: a factura passa a poder ser emitida em nome do próprio motorista.
--
-- PROBLEMA A RESOLVER: contrato_cobrancas.destinatario_id tem FK para
-- clientes(id) e destinatario_papel só aceita 'cliente'|'condutor'. Um
-- motorista_ativo não entra ali. Em vez de mexer nessas restrições (que
-- arrastariam os triggers de conta-corrente e a RPC de cessão), usa-se a
-- costura que o esquema já previa: motoristas_ativos.cliente_id — 66 dos 524
-- motoristas já estavam ligados a uma ficha de cliente.
--
-- Esta função garante essa ficha, de forma idempotente:
--   1. já ligado           → devolve o cliente_id existente;
--   2. NIF já é de um cliente da org → reaproveita (não duplica fichas);
--   3. caso contrário      → cria a ficha a partir dos dados do motorista.
-- Em qualquer dos casos deixa motoristas_ativos.cliente_id preenchido, por
-- isso a 2.ª facturação do mesmo motorista já cai no caso 1.
--
-- Sem NIF a ficha é criada na mesma: o adapter fiscal trata NIF vazio como
-- consumidor final (ver resolveIdClient em providers/keyinvoice.ts). 57 dos
-- 524 motoristas estão nessa situação.
-- ============================================================

create or replace function public.garantir_cliente_do_motorista(p_motorista_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m          public.motoristas_ativos%rowtype;
  v_cliente_id uuid;
  v_nif        text;
  v_nome       text;
begin
  select * into v_m from public.motoristas_ativos where id = p_motorista_id;
  if not found then
    raise exception 'Motorista % não encontrado.', p_motorista_id;
  end if;
  if v_m.org_id is distinct from get_current_org_id() then
    raise exception 'Sem permissão sobre este motorista.';
  end if;

  -- 1. Já tem ficha de cliente associada.
  if v_m.cliente_id is not null then
    return v_m.cliente_id;
  end if;

  v_nif  := nullif(btrim(coalesce(v_m.nif, '')), '');
  v_nome := nullif(btrim(coalesce(v_m.nome, '')), '');

  if v_nome is null then
    raise exception 'O motorista não tem nome preenchido — preenche a ficha dele antes de faturar.';
  end if;

  -- NIF inválido daria um erro do trigger de validação (trg_validar_nif_iban)
  -- a meio da faturação, difícil de perceber. Falha aqui, a dizer o que há a
  -- corrigir. São 5 dos 524 motoristas à data desta migração.
  if v_nif is not null and not public.nif_pt_valido(v_nif) then
    raise exception 'O NIF de % é inválido ("%") — corrige a ficha do motorista antes de faturar em nome dele.',
      v_nome, v_nif;
  end if;

  -- 2. Reaproveita uma ficha existente com o mesmo NIF (evita duplicados —
  --    clientes.nif não tem índice único, a deduplicação é feita aqui).
  if v_nif is not null then
    select c.id into v_cliente_id
      from public.clientes c
     where c.org_id = v_m.org_id
       and nullif(btrim(coalesce(c.nif, '')), '') = v_nif
     order by c.created_at
     limit 1;
  end if;

  -- 3. Cria a ficha. tipo_cliente='condutor' é o valor que o CHECK já prevê
  --    para pessoas que conduzem mas não são o titular do contrato.
  --    cidade preenche também `localidade`: o cabeçalho fiscal lê de
  --    `localidade` e o motorista só tem `cidade`.
  if v_cliente_id is null then
    insert into public.clientes (
      org_id, nome, nif, morada, codigo_postal, cidade, localidade, email, telefone,
      tipo_cliente, is_empresa
    )
    values (
      v_m.org_id, v_nome, v_nif, v_m.morada, v_m.codigo_postal, v_m.cidade, v_m.cidade,
      nullif(btrim(coalesce(v_m.email, '')), ''), v_m.telefone,
      'condutor', false
    )
    returning id into v_cliente_id;
  end if;

  update public.motoristas_ativos
     set cliente_id = v_cliente_id
   where id = p_motorista_id;

  return v_cliente_id;
end;
$$;

revoke all on function public.garantir_cliente_do_motorista(uuid) from public, anon;
grant execute on function public.garantir_cliente_do_motorista(uuid) to authenticated, service_role;

comment on function public.garantir_cliente_do_motorista(uuid) is
  'Devolve (criando se preciso) o clientes.id que representa fiscalmente um motorista, para o poder pôr como destinatário de uma cobrança/factura. Idempotente.';
