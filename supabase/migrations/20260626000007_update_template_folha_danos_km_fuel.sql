-- Actualiza o template "Folha de Danos" para incluir tabela de KM e combustível.
UPDATE public.document_templates
SET template_data = jsonb_build_object(
  'conteudo', $html$<h1 style="text-align:center">FOLHA DE REGISTO DE DANOS — {{momento_folha}}</h1>
<p style="text-align:center"><strong>{{empresa_nome_completo}}</strong> · NIF {{empresa_nif}}</p>
<br>
<p>A presente folha documenta os danos existentes na viatura à data de emissão deste documento, pertencente à frota de <strong>{{empresa_nome_completo}}</strong>.</p>
<p>Os danos identificados encontram-se detalhados na listagem abaixo, incluindo localização, descrição, estado atual e respetivo registo fotográfico.</p>
<br>
<table border="1" style="width:100%;border-collapse:collapse;font-size:10pt">
  <tr>
    <td style="border:1px solid #cccccc;padding:4px 8px;background-color:#f5f5f5;font-weight:bold;width:25%">Matrícula</td>
    <td style="border:1px solid #cccccc;padding:4px 8px;width:25%">{{viatura_matricula}}</td>
    <td style="border:1px solid #cccccc;padding:4px 8px;background-color:#f5f5f5;font-weight:bold;width:25%">Motorista</td>
    <td style="border:1px solid #cccccc;padding:4px 8px;width:25%">{{motorista_nome}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #cccccc;padding:4px 8px;background-color:#f5f5f5;font-weight:bold">KM Saída</td>
    <td style="border:1px solid #cccccc;padding:4px 8px">{{km_saida}}</td>
    <td style="border:1px solid #cccccc;padding:4px 8px;background-color:#f5f5f5;font-weight:bold">KM Entrada</td>
    <td style="border:1px solid #cccccc;padding:4px 8px">{{km_entrada}}</td>
  </tr>
  <tr>
    <td style="border:1px solid #cccccc;padding:4px 8px;background-color:#f5f5f5;font-weight:bold">Combustível Saída</td>
    <td style="border:1px solid #cccccc;padding:4px 8px">{{combustivel_saida}}</td>
    <td style="border:1px solid #cccccc;padding:4px 8px;background-color:#f5f5f5;font-weight:bold">Combustível Entrada</td>
    <td style="border:1px solid #cccccc;padding:4px 8px">{{combustivel_entrada}}</td>
  </tr>
</table>
<br>
{{secao_danos}}
<br>
<p><strong>Observações:</strong> {{observacoes_momento}}</p>
<br>
<p>{{cidade_assinatura}}, {{data_assinatura}}</p>
<table style="width:100%; border-collapse:collapse; text-align:center; break-inside: avoid;">
  <tr>
    <td style="width:50%; vertical-align:top;">
      <p>_________________________________</p>
      <p>O Cliente</p>
    </td>
    <td style="width:50%; vertical-align:top;">
      <p>_________________________________</p>
      <p>O Condutor</p>
    </td>
  </tr>
</table>,
  'topMargin', 50,
  'bottomMargin', 38
),
versao = versao + 1
WHERE tipo = 'anexo_danos';
