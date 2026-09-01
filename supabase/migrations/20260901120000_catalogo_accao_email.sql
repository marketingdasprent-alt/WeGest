-- ============================================================================
-- automation_catalogo() ganha a descrição do canal de email
-- ============================================================================
--
-- NÃO fica dentro de `'accoes'`. Essa chave é especificamente «as acções que
-- `fn_executar_accao_interna` sabe despachar» — e há um teste pgTAP
-- (accoes_internas.test.sql) que fixa isso como invariante: «o catálogo
-- declara exactamente três acções». Foi tentado meter o email lá dentro, com
-- `entidade: null` e `recurso` meramente descritivo, e partiu esse invariante
-- — com razão: o email nunca passa por `fn_executar_accao_interna`, não tem
-- handler, não tem entidade do domínio para cruzar com a do evento. Não era
-- uma acção interna a mais, e fingir que era só para "consistência de forma"
-- confundia o que `'accoes'` promete.
--
-- Fica numa chave própria, `notificacao_email`, com só o que é verdade sobre
-- ela: nome e módulo. Nada lê isto ainda — existe para o dia em que o editor
-- quiser mostrar a descrição do canal a partir do servidor em vez de a ter
-- escrita em `catalogo.ts`.
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
      )
    ),
    -- Fora de 'accoes' de propósito — ver o cabeçalho deste ficheiro.
    'notificacao_email', jsonb_build_object(
      'label',  'Enviar email',
      'modulo', 'Notificações'
    )
  );
$$;

comment on function public.automation_catalogo() is
  'Fonte única do que é automatizável: eventos (com os campos do payload e o seu tipo), acções internas (com permissão, entidade e configuração permitida) e a descrição do canal de email. Lido pelo editor, pelo validador e pelo despacho.';

revoke all on function public.automation_catalogo() from public, anon;
grant execute on function public.automation_catalogo() to authenticated, service_role;
