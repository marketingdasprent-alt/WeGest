-- ============================================================
-- digest.resumo_diario: {{lista}} -> {{{lista}}}
-- ============================================================
-- renderTemplate() passou a escapar `{{var}}` por omissão: o resultado é
-- entregue ao provider como HTML e os valores vêm de campos de domínio escritos
-- por pessoas (cliente_nome, descricao, motivo, titulo de ticket, nome de uma
-- candidatura submetida por formulário público). Sem escape, um valor com
-- `<a href>` era renderizado como HTML num email assinado pela organização.
--
-- `lista` é a ÚNICA variável legitimamente HTML: é montada em SQL por
-- enviar_digests_diarios() com `<br>` como separador. Passa à forma tripla,
-- que é a marca explícita de "confio neste valor".
--
-- ESTA MIGRAÇÃO E A ALTERAÇÃO DA EDGE FUNCTION SÃO INSEPARÁVEIS:
--   · só o código sem este UPDATE  -> digest sai com `<br>` literais à vista
--   · só este UPDATE sem o código  -> `{{{lista}}}` não é reconhecido e sai cru
-- Aplicar as duas, ou nenhuma. Ver
-- supabase/functions/_shared/notification-queue/renderTemplate.ts
--
-- sistema.job_falhou também é corpo_formato='html', mas o `<br>` está no texto
-- do template, não numa variável: `{{last_error}}` deve mesmo ser escapado (é
-- uma mensagem de erro arbitrária). Fica como está.

update public.notification_templates
set corpo_template = replace(corpo_template, '{{lista}}', '{{{lista}}}'),
    updated_at = now()
where codigo = 'digest.resumo_diario'
  and canal = 'email'
  and corpo_template like '%{{lista}}%'
  and corpo_template not like '%{{{lista}}}%';

do $$
declare
  v_por_migrar integer;
  v_migrados   integer;
begin
  select count(*) into v_por_migrar from public.notification_templates
   where codigo = 'digest.resumo_diario' and canal = 'email' and corpo_template like '%{{lista}}%'
     and corpo_template not like '%{{{lista}}}%';
  select count(*) into v_migrados from public.notification_templates
   where codigo = 'digest.resumo_diario' and canal = 'email' and corpo_template like '%{{{lista}}}%';

  if v_por_migrar > 0 then
    raise exception 'Abortado: % templates de digest ainda com {{lista}} por migrar.', v_por_migrar;
  end if;

  raise notice 'digest.resumo_diario: % templates em forma tripla.', v_migrados;
end $$;

comment on column public.notification_templates.corpo_template is
  'Corpo com placeholders. {{var}} é ESCAPADO (HTML) — usar sempre, por omissão. {{{var}}} não é escapado: só para valores que já são HTML de confiança montado pelo sistema (hoje apenas `lista`, do digest).';
