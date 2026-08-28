-- ============================================================
-- Pedidos de assinatura de documentos
-- ============================================================
-- Enviar um documento ao cliente, condutor ou motorista para assinar, e receber
-- de volta o documento assinado.
--
-- Cada pedido é independente: assina quem cria o documento e assina quem o
-- recebe. Não há estado agregado de "assinado por todos" — enviar o mesmo
-- contrato ao cliente e ao condutor cria duas linhas, dois links e dois PDF
-- assinados. Quem quiser saber quem assinou, olha para os pedidos daquele
-- contrato.
--
-- O `id` é o token do link, como em `danos_tokens` e `realizacao_tokens`. A
-- página pública `/assinar/:token` nunca fala com a base de dados: as edge
-- functions validam o token com chave de serviço, que ignora RLS.

create table if not exists public.documento_assinatura_pedidos (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null,
  contrato_id              uuid,
  template_id              uuid,

  papel                    text not null
    check (papel in ('cliente', 'condutor', 'motorista')),
  signatario_nome          text not null,
  signatario_email         text not null,
  cliente_id               uuid,
  motorista_id             uuid,

  -- O documento tal como foi enviado, e a fotografia dos dados que o
  -- produziram. A fotografia vive no storage, ao lado do PDF, porque inclui
  -- imagens em `data:` e daria linhas de megabytes nesta tabela.
  documento_nome           text not null,
  documento_path           text not null,
  snapshot_path            text not null,

  -- O link morre de duas maneiras: quando o prazo passa, e quando é assinado.
  expires_at               timestamptz not null,
  assinado_em              timestamptz,
  assinatura_path          text,
  documento_assinado_path  text,
  assinado_ip              text,
  assinado_user_agent      text,

  created_by               uuid,
  created_at               timestamptz not null default now()
);

comment on table public.documento_assinatura_pedidos is
  'Pedidos de assinatura de documentos. O id e o token do link publico /assinar/:token.';

-- Sem chaves estrangeiras para contrato, cliente ou motorista: apagar um
-- contrato não pode destruir a prova de que alguém assinou um documento.

create index if not exists documento_assinatura_pedidos_contrato_idx
  on public.documento_assinatura_pedidos (contrato_id);

create index if not exists documento_assinatura_pedidos_org_idx
  on public.documento_assinatura_pedidos (org_id, created_at desc);

alter table public.documento_assinatura_pedidos enable row level security;

-- Políticas iguais às de `danos_tokens`: a organização vê e cria os seus
-- pedidos, e o anónimo não toca na tabela de todo. Assinar e carimbar a prova é
-- feito pelas edge functions com chave de serviço, por isso não há política de
-- UPDATE para utilizadores.

drop policy if exists mt_documento_assinatura_pedidos_select on public.documento_assinatura_pedidos;
create policy mt_documento_assinatura_pedidos_select
  on public.documento_assinatura_pedidos
  for select to authenticated
  using (org_id = get_current_org_id());

drop policy if exists mt_documento_assinatura_pedidos_insert on public.documento_assinatura_pedidos;
create policy mt_documento_assinatura_pedidos_insert
  on public.documento_assinatura_pedidos
  for insert to authenticated
  with check (org_id = get_current_org_id() and created_by = auth.uid());

drop policy if exists rls_deny_anon on public.documento_assinatura_pedidos;
create policy rls_deny_anon
  on public.documento_assinatura_pedidos
  as restrictive for all to anon
  using (false) with check (false);
