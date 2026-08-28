-- Decisão de negócio: a estratégia "Gestor responsável específico" não
-- foi aprovada para as 4 regras de expiração (seguro, IPO, carta,
-- licença TVDE) — o fluxo aprovado é escolher grupo(s)/cargo(s)
-- diretamente. Passam todas a notificar o cargo "Gestor TVDE" (já
-- existente em todas as orgs, ilike para cobrir a variação de maiúsculas
-- "Gestor TVDE"/"GESTOR TVDE").

-- 1) Regras já existentes: traduz de gestor_responsavel para cargo.
update public.automation_rules ar
set acao_config = (ar.acao_config - 'destinatarios_recurso')
  || jsonb_build_object(
       'destinatarios_estrategia', 'cargo',
       'destinatarios_cargo_ids', coalesce(
         (select jsonb_agg(c.id) from public.cargos c where c.org_id = ar.org_id and c.nome ilike 'gestor tvde'),
         '[]'::jsonb
       )
     )
where ar.event_type in (
  'viatura.seguro_expirando', 'viatura.inspecao_expirando',
  'motorista.carta_expirando', 'motorista.licenca_tvde_expirando'
)
and ar.acao_config->>'destinatarios_estrategia' = 'gestor_responsavel';

-- 2) seed_automacao_defaults(): novas orgs passam a semear estas 4 regras
--    já em modo cargo/Gestor TVDE, em vez de gestor_responsavel. As
--    3 regras que ainda usavam destinatarios_recurso (cobranca.gerada,
--    utilizador.criado, contrato_renting.renovacao_proxima) — resquício
--    da estratégia 'recurso' já removida do sistema — passam a 'cargo'
--    sem cargo escolhido por omissão (só admins até a org configurar).
create or replace function public.seed_automacao_defaults(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cargo_gestor_tvde jsonb;
begin
  select coalesce(jsonb_agg(c.id), '[]'::jsonb)
  into v_cargo_gestor_tvde
  from public.cargos c
  where c.org_id = p_org_id and c.nome ilike 'gestor tvde';

  insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config, cooldown_minutos)
  values
    (
      p_org_id, 'viatura.seguro_expirando', 'Seguro de viatura a expirar', 'viatura.seguro_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.seguro_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Seguro de viatura a expirar'),
      1440
    ),
    (
      p_org_id, 'viatura.inspecao_expirando', 'Inspeção periódica (IPO) a expirar', 'viatura.inspecao_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.inspecao_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Inspeção periódica (IPO) a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.carta_expirando', 'Carta de condução do motorista a expirar', 'motorista.carta_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.carta_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Carta de condução do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.licenca_tvde_expirando', 'Licença TVDE do motorista a expirar', 'motorista.licenca_tvde_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.licenca_tvde_expirando', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_gestor_tvde, 'enviar_email', true, 'titulo', 'Licença TVDE do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'cobranca.gerada', 'Nova cobrança gerada — pronta a emitir', 'cobranca.gerada', 'notificacao',
      jsonb_build_object('template_codigo', 'cobranca.gerada', 'destinatarios_estrategia', 'cargo', 'enviar_email', false, 'titulo', 'Nova cobrança gerada'),
      0
    ),
    (
      p_org_id, 'utilizador.criado', 'Novo utilizador criado', 'utilizador.criado', 'notificacao',
      jsonb_build_object('template_codigo', 'utilizador.criado', 'destinatarios_estrategia', 'cargo', 'enviar_email', false, 'titulo', 'Novo utilizador criado'),
      0
    ),
    (
      p_org_id, 'contrato_renting.renovacao_proxima', 'Contrato de renting a atingir data de renovação', 'contrato_renting.renovacao_proxima', 'notificacao',
      jsonb_build_object('template_codigo', 'contrato_renting.renovacao_proxima', 'destinatarios_estrategia', 'cargo', 'enviar_email', true, 'enviar_email_digest', true, 'titulo', 'Contrato a renovar'),
      1440
    )
  on conflict (codigo, org_id) do nothing;

  insert into public.notification_templates (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato, variaveis_esperadas)
  values
    (
      p_org_id, 'viatura.seguro_expirando', 'email', 'pt-PT',
      'Seguro da viatura {{matricula}} a expirar',
      'O seguro da viatura {{matricula}} expira em {{seguro_validade}}. Confirma se a renovação já está tratada.',
      'text', array['matricula', 'seguro_validade']
    ),
    (
      p_org_id, 'viatura.inspecao_expirando', 'email', 'pt-PT',
      'Inspeção periódica (IPO) da viatura {{matricula}} a expirar',
      'A inspeção periódica (IPO) da viatura {{matricula}} expira em {{inspecao_validade}}. Agenda a inspeção antes da data.',
      'text', array['matricula', 'inspecao_validade']
    ),
    (
      p_org_id, 'motorista.carta_expirando', 'email', 'pt-PT',
      'Carta de condução de {{nome}} a expirar',
      'A carta de condução de {{nome}} expira em {{carta_validade}}. Confirma que a renovação está a ser tratada antes de atribuir novos contratos.',
      'text', array['nome', 'carta_validade']
    ),
    (
      p_org_id, 'motorista.licenca_tvde_expirando', 'email', 'pt-PT',
      'Licença TVDE de {{nome}} a expirar',
      'A licença TVDE de {{nome}} expira em {{licenca_tvde_validade}}. Confirma que a renovação está a ser tratada antes de atribuir novos contratos.',
      'text', array['nome', 'licenca_tvde_validade']
    ),
    (
      p_org_id, 'contrato_renting.renovacao_proxima', 'email', 'pt-PT',
      'Contrato {{codigo}} ({{matricula}}) a atingir a data de renovação',
      'O contrato de renting nº {{codigo}} de {{cliente_nome}} (viatura {{matricula}}) atinge a data de renovação em {{prazo}}. Confirma se a renovação já foi preparada.',
      'text', array['codigo', 'matricula', 'cliente_nome', 'prazo']
    ),
    (
      p_org_id, 'digest.resumo_diario', 'email', 'pt-PT',
      'Resumo diário — {{total}} aviso(s) novo(s)',
      'Tens {{total}} aviso(s) novo(s) hoje:<br><br>{{lista}}',
      'html', array['total', 'lista']
    )
  on conflict (codigo, canal, idioma, versao, org_id) do nothing;
end;
$$;
