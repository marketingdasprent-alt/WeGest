-- ============================================================================
-- O link deixa de estar escrito no corpo — o botão do email já o leva
-- ============================================================================
--
-- Vários templates terminam com uma linha do género "Abrir o contrato:
-- {{link}}" ou "Abrir o ticket: {{link}}". Faziam falta quando o email era
-- texto sem formatação nenhuma e não havia outra forma de chegar à
-- aplicação.
--
-- Desde que o caminho genérico passou a usar a moldura partilhada, todos
-- estes emails levam um botão "Ver detalhes" construído a partir do mesmo
-- `notifications.link`. A linha no corpo passou a ser o mesmo endereço duas
-- vezes, uma delas como URL cru no meio do texto.
--
-- Só toca em linhas que ainda estão exactamente na forma semeada e no FIM do
-- corpo. Um template que alguém tenha reescrito à mão não é mexido — a
-- expressão simplesmente não casa.
-- ============================================================================

update public.notification_templates
set corpo_template = regexp_replace(corpo_template, E'\\s*\\n[^\\n]{1,40}: \\{\\{link\\}\\}\\s*$', ''),
    updated_at = now()
where canal = 'email'
  and corpo_template ~ E'\\n[^\\n]{1,40}: \\{\\{link\\}\\}\\s*$';

-- `link` deixa de ser esperada por estes templates. A coluna é informativa
-- (nada valida contra ela), mas deixá-la a mentir sobre o que o corpo usa
-- confundiria quem for ler a definição a seguir.
update public.notification_templates
set variaveis_esperadas = array_remove(variaveis_esperadas, 'link')
where canal = 'email'
  and variaveis_esperadas is not null
  and 'link' = any(variaveis_esperadas)
  and corpo_template not like '%{{link}}%';
