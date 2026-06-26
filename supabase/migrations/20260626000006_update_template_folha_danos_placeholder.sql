-- ============================================================
-- Actualiza o conteúdo do template "Folha de Danos" para incluir
-- o placeholder {{secao_danos}} onde a tabela de danos é injectada.
-- ============================================================

UPDATE public.document_templates
SET template_data = jsonb_build_object(
  'conteudo', $html$<h1 style="text-align:center">FOLHA DE REGISTO DE DANOS</h1>
<p style="text-align:center"><strong>{{empresa_nomeCompleto}}</strong> · NIF {{empresa_nif}}</p>
<br>
<p>A presente folha documenta os danos existentes na viatura à data de emissão deste documento, pertencente à frota de <strong>{{empresa_nomeCompleto}}</strong>.</p>
<p>Os danos identificados encontram-se detalhados na listagem abaixo, incluindo localização, descrição, estado atual e respetivo registo fotográfico.</p>
<br>
{{secao_danos}}
<br>
<p><strong>Observações adicionais:</strong></p>
<br>
<p>_______________________________________________________________________________</p>
<br>
<p>_______________________________________________________________________________</p>
<br>
<p>_______________________________________________________________________________</p>
<br>
<br>
<p>{{cidade_assinatura}}, {{data_assinatura}}</p>
<br>
<br>
<p>_________________________________</p>
<p>Assinatura e carimbo</p>$html$,
  'topMargin', 50,
  'bottomMargin', 38
),
versao = versao + 1
WHERE tipo = 'anexo_danos';
