-- ============================================================
-- Template "Contrato Aluguer" — Condições Particulares com tipografia limpa
-- ============================================================
-- O contrato de aluguer é 100% template (BD), como os outros documentos
-- (produto SaaS — nada hardcoded). O motor de render é de TEXTO (h1/h2/p/
-- strong/alinhamento/tamanho), sem caixas/colunas — por isso desenhamos a
-- folha de Condições Particulares com tipografia forte e bem organizada.
--
-- Esta migration SUBSTITUI a parte de Particulares (tudo antes do 1º <h2>,
-- o cabeçalho "CONDIÇÕES GERAIS") por uma versão limpa, e MANTÉM as
-- Condições Gerais existentes. Placeholders preenchidos pelo gerador:
--   {{numero_contrato}} {{data_inicio}} {{data_fim}} {{duracao_meses}}
--   {{motorista_*}} {{carta_*}} {{viatura_*}} {{tarifa_diaria}} {{franquia}}
--   {{caucao}} {{kms_incluidos}} {{km_adicional}} {{total}} {{observacoes}}
--   {{cidade_assinatura}} {{data_assinatura}} {{colaborador_nome}}
--
-- Idempotente: a nova secção não tem <h2>, logo correr de novo volta a
-- cortar pelas Gerais e a prepor as mesmas Particulares (resultado igual).
-- ============================================================

UPDATE public.document_templates t
SET template_data = jsonb_set(
  t.template_data,
  '{conteudo}',
  to_jsonb(
    $PART$<h1 style="text-align:center">CONTRATO DE ALUGUER</h1>
<p style="text-align:center">N.º {{numero_contrato}}&nbsp;&nbsp;·&nbsp;&nbsp;{{data_inicio}} a {{data_fim}}</p>
<br>
<p style="font-size:11px"><strong>CLIENTE</strong></p>
<p><strong>{{motorista_nome}}</strong>&nbsp;&nbsp;—&nbsp;&nbsp;NIF {{motorista_nif}}</p>
<p>{{motorista_morada}}</p>
<p>{{motorista_telefone}}&nbsp;&nbsp;·&nbsp;&nbsp;{{motorista_email}}</p>
<br>
<p style="font-size:11px"><strong>CONDUTOR</strong></p>
<p><strong>{{motorista_nome}}</strong>&nbsp;&nbsp;—&nbsp;&nbsp;NIF {{motorista_nif}}</p>
<p>Carta de condução: {{carta_conducao}} (validade {{carta_validade}})</p>
<br>
<p style="font-size:11px"><strong>VIATURA</strong></p>
<p><strong>{{viatura_marca_modelo}}</strong>&nbsp;&nbsp;—&nbsp;&nbsp;Matrícula {{viatura_matricula}}</p>
<p>Grupo: {{viatura_grupo}}&nbsp;&nbsp;·&nbsp;&nbsp;Quilómetros: {{viatura_kms}}</p>
<br>
<p style="font-size:11px"><strong>PERÍODO</strong></p>
<p>Levantamento: {{data_inicio}}&nbsp;&nbsp;·&nbsp;&nbsp;Devolução: {{data_fim}}&nbsp;&nbsp;·&nbsp;&nbsp;Duração: {{duracao_meses}} mês(es)</p>
<br>
<p style="font-size:11px"><strong>FATURAÇÃO</strong></p>
<p>Tarifa diária: {{tarifa_diaria}}&nbsp;&nbsp;·&nbsp;&nbsp;Franquia: {{franquia}}&nbsp;&nbsp;·&nbsp;&nbsp;Caução: {{caucao}}</p>
<p>Kms incluídos: {{kms_incluidos}}&nbsp;&nbsp;·&nbsp;&nbsp;Km adicional: {{km_adicional}}</p>
<p style="font-size:12px"><strong>TOTAL: {{total}}</strong></p>
<br>
<p style="font-size:11px"><strong>OBSERVAÇÕES</strong></p>
<p>{{observacoes}}</p>
<br><br>
<p>{{cidade_assinatura}}, {{data_assinatura}}</p>
<br><br>
<p>______________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;______________________________</p>
<p><strong>O Cliente</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<strong>O Colaborador</strong></p>
<p>{{motorista_nome}}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{{colaborador_nome}}</p>
<br>
$PART$
    ||
    CASE
      WHEN position('<h2' IN t.template_data->>'conteudo') > 0
        THEN substring(t.template_data->>'conteudo' FROM position('<h2' IN t.template_data->>'conteudo'))
      ELSE ''
    END
  )
)
WHERE t.tipo = 'contrato_aluguer'
  AND t.template_data ? 'conteudo';
