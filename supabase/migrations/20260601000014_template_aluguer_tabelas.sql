-- ============================================================
-- Template "Contrato Aluguer" — Condições Particulares com TABELAS
-- ============================================================
-- O motor de render passou a desenhar <table> (vetorial: caixas, 2 colunas,
-- cor de fundo, total destacado). Esta migration reescreve a folha de
-- Particulares usando tabelas e mantém as Condições Gerais existentes.
--
-- Tudo é template (BD), editável no editor de documentos (que agora suporta
-- tabelas). Placeholders preenchidos pelo gerador:
--   {{numero_contrato}} {{data_inicio}} {{data_fim}} {{duracao_meses}}
--   {{motorista_*}} {{carta_*}} {{viatura_*}} {{tarifa_diaria}} {{franquia}}
--   {{caucao}} {{kms_incluidos}} {{km_adicional}} {{total}} {{observacoes}}
--   {{cidade_assinatura}} {{data_assinatura}} {{colaborador_nome}}
--
-- Idempotente: a secção nova não tem <h2>, logo correr de novo volta a
-- cortar pelas Gerais e a prepor as mesmas Particulares.
-- ============================================================

UPDATE public.document_templates t
SET template_data = jsonb_set(
  t.template_data,
  '{conteudo}',
  to_jsonb(
    $PART$<h1 style="text-align:center">CONTRATO DE ALUGUER</h1>
<p style="text-align:center">N.º {{numero_contrato}}&nbsp;&nbsp;·&nbsp;&nbsp;{{data_inicio}} a {{data_fim}}</p>
<br>
<table><tr>
<td style="background-color:#f7f8fa"><strong>CLIENTE</strong><br><strong>{{motorista_nome}}</strong><br>NIF {{motorista_nif}}<br>{{motorista_morada}}<br>{{motorista_telefone}} · {{motorista_email}}</td>
<td style="background-color:#f7f8fa"><strong>CONDUTOR</strong><br><strong>{{motorista_nome}}</strong><br>NIF {{motorista_nif}}<br>Carta {{carta_conducao}} (val. {{carta_validade}})</td>
</tr></table>
<br>
<table><tr>
<td style="background-color:#f7f8fa"><strong>LEVANTAMENTO</strong><br>{{data_inicio}}</td>
<td style="background-color:#f7f8fa"><strong>DEVOLUÇÃO</strong><br>{{data_fim}}</td>
<td style="background-color:#f7f8fa"><strong>DURAÇÃO</strong><br>{{duracao_meses}} mês(es)</td>
</tr></table>
<br>
<table><tr>
<td style="background-color:#f7f8fa"><strong>VIATURA</strong><br><strong>{{viatura_marca_modelo}}</strong> — {{viatura_matricula}}<br>Grupo {{viatura_grupo}} · {{viatura_kms}} km</td>
</tr></table>
<br>
<table>
<tr><td>Tarifa diária</td><td style="text-align:right">{{tarifa_diaria}}</td></tr>
<tr><td>Franquia</td><td style="text-align:right">{{franquia}}</td></tr>
<tr><td>Caução</td><td style="text-align:right">{{caucao}}</td></tr>
<tr><td>Kms incluídos · Km adicional</td><td style="text-align:right">{{kms_incluidos}} · {{km_adicional}}</td></tr>
<tr><td style="background-color:#1e3a8a;color:#ffffff"><strong>TOTAL</strong></td><td style="background-color:#1e3a8a;color:#ffffff;text-align:right"><strong>{{total}}</strong></td></tr>
</table>
<br>
<p style="font-size:11px"><strong>OBSERVAÇÕES</strong></p>
<p>{{observacoes}}</p>
<br>
<p>{{cidade_assinatura}}, {{data_assinatura}}</p>
<br>
<table><tr>
<td style="text-align:center">__________________________<br><strong>O Cliente</strong><br>{{motorista_nome}}</td>
<td style="text-align:center">__________________________<br><strong>O Colaborador</strong><br>{{colaborador_nome}}</td>
</tr></table>
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
