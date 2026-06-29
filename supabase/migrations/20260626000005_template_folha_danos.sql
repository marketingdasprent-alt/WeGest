-- ============================================================
-- Template padrão: Folha de Danos (anexo_danos)
-- ============================================================
-- Semeia um template de tipo 'anexo_danos' para cada empresa
-- (clientes.tipo = 'empresa') existente na base de dados.
-- O conteúdo é o texto de introdução; a secção de danos
-- (tabela + fotos + QR) é appended automaticamente pelo renderer.
--
-- Idempotente: usa ON CONFLICT na constraint
-- uq_doc_templates_cliente_tipo_versao (cliente_empresa_id, tipo, versao).
-- ============================================================

INSERT INTO public.document_templates (
  nome,
  tipo,
  cliente_empresa_id,
  org_id,
  template_data,
  campos_dinamicos,
  ativo,
  versao
)
SELECT
  'Folha de Danos - ' || c.nome,
  'anexo_danos',
  c.id,
  c.org_id,
  jsonb_build_object(
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
<p>Condutor: {{motorista_nome}}</p>
<br>
<br>
<p>_________________________________</p>
<p>Assinatura e carimbo: {{empresa_nomeCompleto}}</p>$html$,
    'topMargin', 50,
    'bottomMargin', 38
  ),
  '{}'::jsonb,
  true,
  1
FROM public.clientes c
WHERE c.is_emissora = true
  AND c.org_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.document_templates dt
  WHERE dt.tipo = 'anexo_danos'
    AND dt.cliente_empresa_id = c.id
);
