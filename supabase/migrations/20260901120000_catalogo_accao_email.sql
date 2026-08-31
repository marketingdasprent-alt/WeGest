-- ============================================================================
-- automation_catalogo() ganha a entrada do email
-- ============================================================================
--
-- Consistência, não consumo: nada lê esta entrada hoje. `accoesParaEvento`
-- no frontend só é chamada na secção "Acção no sistema" (automação interna),
-- e filtra por `entidade` — como esta entrada tem `entidade: null`, nunca
-- aparece nessa lista, que é o comportamento certo: o email não é uma acção
-- interna e não deve aparecer ao lado delas.
--
-- ── PORQUE `entidade` É `null` E `recurso` NÃO É APLICADO ───────────────────
--
-- As três acções internas usam estes dois campos a sério: `entidade` é
-- cruzada com a do evento no validador (`fn_validar_acao_config`) e no
-- despacho (`fn_executar_accao_interna`); `recurso` é verificado com
-- `can_edit(auth.uid(), recurso)` antes de aceitar a gravação.
--
-- O email não opera sobre uma entidade do domínio — dirige-se a pessoas
-- (cargos, utilizadores), não a um registo que possa ser comparado com o do
-- evento. E não há um `recurso` PRÓPRIO a verificar: quem escreve qualquer
-- linha de `automation_rules`, seja qual for o `acao_tipo`, já passa pela RLS
-- de `can_edit(user, 'automacoes')` na própria tabela. Um segundo gate aqui
-- seria redundante, não mais seguro.
--
-- Por isso `entidade: null` e `recurso: 'automacoes'` ficam como metadados
-- descritivos — coerentes com o resto do catálogo, mas sem comportamento
-- amarrado a eles. Se um dia precisarem de ser aplicados, é aqui que já
-- estão à espera.
-- ============================================================================

create or replace function public.automation_catalogo()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'eventos', jsonb_build_object(
      'assistencia_ticket.aberto_demasiado_tempo', jsonb_build_object(
        'label',    'Ticket aberto há demasiado tempo',
        'modulo',   'Assistência',
        'entidade', 'assistencia_tickets',
        'campos', jsonb_build_array(
          jsonb_build_object('id','prioridade','label','Prioridade','tipo','string'),
          jsonb_build_object('id','status',    'label','Estado',    'tipo','string')
        )
      ),
      'motorista.ficha_incompleta', jsonb_build_object(
        'label',    'Ficha de motorista incompleta',
        'modulo',   'Motoristas',
        'entidade', 'motoristas_ativos',
        'campos', jsonb_build_array(
          jsonb_build_object('id','nome','label','Nome','tipo','string')
        )
      ),
      'viatura.seguro_expirando', jsonb_build_object(
        'label',    'Seguro da viatura a expirar',
        'modulo',   'Viaturas',
        'entidade', 'viaturas',
        'campos', jsonb_build_array(
          jsonb_build_object('id','matricula','label','Matrícula','tipo','string')
        )
      )
    ),
    'accoes', jsonb_build_object(
      'motorista.atualizar_campo', jsonb_build_object(
        'label',    'Preencher um campo do motorista',
        'modulo',   'Motoristas',
        'entidade', 'motoristas_ativos',
        'recurso',  'motoristas_editar',
        'campos_permitidos', jsonb_build_array('observacoes')
      ),
      'viatura.atualizar_campo', jsonb_build_object(
        'label',    'Preencher um campo da viatura',
        'modulo',   'Viaturas',
        'entidade', 'viaturas',
        'recurso',  'viaturas_editar',
        'campos_permitidos', jsonb_build_array('observacoes')
      ),
      'ticket.alterar_estado', jsonb_build_object(
        'label',    'Alterar o estado do ticket',
        'modulo',   'Assistência',
        'entidade', 'assistencia_tickets',
        'recurso',  'tickets_gerir',
        'valores', jsonb_build_array('pendente','aberto','em_andamento','aguardando','resolvido','fechado')
      ),
      'notificacao.email', jsonb_build_object(
        'label',    'Enviar email',
        'modulo',   'Notificações',
        'entidade', null,
        'recurso',  'automacoes'
      )
    )
  );
$$;

comment on function public.automation_catalogo() is
  'Fonte única do que é automatizável: eventos (com os campos do payload e o seu tipo) e acções (com permissão e configuração permitida). Lido pelo editor, pelo validador e pelo despacho. `notificacao.email` é descritiva — entidade e recurso não são aplicados para ela, ao contrário das acções internas.';

revoke all on function public.automation_catalogo() from public, anon;
grant execute on function public.automation_catalogo() to authenticated, service_role;
