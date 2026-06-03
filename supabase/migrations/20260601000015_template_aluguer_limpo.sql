-- ============================================================
-- Template "Contrato Aluguer" — estilo limpo (sem caixas)
-- ============================================================
-- O motor passou a suportar: tabelas SEM bordas (layout em colunas), cor e
-- tamanho de fonte POR LINHA dentro das células, cor de texto e <hr>.
-- Isto permite reproduzir o design premium (rótulos cinza + valores a
-- negrito, etiquetas accent, divisórias finas) — tudo como TEMPLATE editável.
--
-- Substitui a folha de Particulares e mantém as Condições Gerais.
-- Idempotente (a secção nova não tem <h2>).
-- ============================================================

UPDATE public.document_templates t
SET template_data = jsonb_set(
  t.template_data,
  '{conteudo}',
  to_jsonb(
    $PART$<h1 style="text-align:center">Contrato de Aluguer</h1>
<p style="text-align:center;color:#8a8d99;font-size:9px">N.º {{numero_contrato}}&nbsp;&nbsp;·&nbsp;&nbsp;{{data_inicio}} — {{data_fim}}</p>
<hr>
<table>
<tr>
<td><span style="color:#2b3a6b;font-size:8px"><strong>CLIENTE</strong></span><br><span style="font-size:12px"><strong>{{motorista_nome}}</strong></span></td>
<td><span style="color:#2b3a6b;font-size:8px"><strong>CONDUTOR</strong></span><br><span style="font-size:12px"><strong>{{motorista_nome}}</strong></span></td>
</tr>
<tr>
<td><span style="color:#8a8d99;font-size:6px">NIF</span><br><strong>{{motorista_nif}}</strong></td>
<td><span style="color:#8a8d99;font-size:6px">NIF</span><br><strong>{{motorista_nif}}</strong></td>
</tr>
<tr>
<td><span style="color:#8a8d99;font-size:6px">TELEMÓVEL</span><br><strong>{{motorista_telefone}}</strong></td>
<td><span style="color:#8a8d99;font-size:6px">CARTA DE CONDUÇÃO</span><br><strong>{{carta_conducao}}</strong></td>
</tr>
<tr>
<td><span style="color:#8a8d99;font-size:6px">EMAIL</span><br><strong>{{motorista_email}}</strong></td>
<td><span style="color:#8a8d99;font-size:6px">MORADA</span><br><strong>{{motorista_morada}}</strong></td>
</tr>
</table>
<hr>
<p style="color:#2b3a6b;font-size:8px"><strong>PERÍODO DE ALUGUER</strong></p>
<table><tr>
<td><span style="color:#8a8d99;font-size:6px">LEVANTAMENTO</span><br><strong>{{data_inicio}}</strong></td>
<td><span style="color:#8a8d99;font-size:6px">DEVOLUÇÃO</span><br><strong>{{data_fim}}</strong></td>
<td><span style="color:#8a8d99;font-size:6px">DURAÇÃO</span><br><strong>{{dias}} dia(s)</strong></td>
</tr></table>
<hr>
<p style="color:#2b3a6b;font-size:8px"><strong>VIATURA</strong></p>
<table><tr>
<td><span style="color:#8a8d99;font-size:6px">MATRÍCULA</span><br><span style="font-size:14px"><strong>{{viatura_matricula}}</strong></span></td>
<td><span style="color:#8a8d99;font-size:6px">MARCA / MODELO</span><br><strong>{{viatura_marca_modelo}}</strong></td>
<td><span style="color:#8a8d99;font-size:6px">GRUPO</span><br><strong>{{viatura_grupo}}</strong></td>
</tr></table>
<table><tr>
<td><span style="color:#8a8d99;font-size:6px">QUILÓMETROS</span><br><strong>{{viatura_kms}}</strong></td>
<td><span style="color:#8a8d99;font-size:6px">FRANQUIA</span><br><strong>{{franquia}}</strong></td>
<td><span style="color:#8a8d99;font-size:6px">CAUÇÃO</span><br><strong>{{caucao}}</strong></td>
<td><span style="color:#8a8d99;font-size:6px">KMS INCLUÍDOS</span><br><strong>{{kms_incluidos}}</strong></td>
</tr></table>
<hr>
<p style="color:#2b3a6b;font-size:8px"><strong>FATURAÇÃO</strong></p>
<table>
<tr><td><span style="color:#5a5d68;font-size:9px">Tarifa diária × {{dias}} dia(s)</span></td><td style="text-align:right"><strong>{{tarifa_diaria}}</strong></td></tr>
<tr><td><span style="color:#5a5d68;font-size:9px">Subtotal</span></td><td style="text-align:right"><strong>{{subtotal}}</strong></td></tr>
<tr><td><span style="color:#5a5d68;font-size:9px">IVA</span></td><td style="text-align:right"><strong>{{iva}}</strong></td></tr>
</table>
<hr>
<table><tr>
<td><span style="color:#8a8d99;font-size:8px"><strong>TOTAL A PAGAR</strong></span></td>
<td style="text-align:right"><span style="color:#2b3a6b;font-size:14px"><strong>{{total}}</strong></span></td>
</tr></table>
<br>
<p style="color:#2b3a6b;font-size:8px"><strong>OBSERVAÇÕES</strong></p>
<p>{{observacoes}}</p>
<br><br>
<p>{{cidade_assinatura}}, {{data_assinatura}}</p>
<br>
<table><tr>
<td style="text-align:center">___________________________<br><strong>{{motorista_nome}}</strong><br><span style="color:#8a8d99;font-size:7px">O Cliente</span></td>
<td style="text-align:center">___________________________<br><strong>{{colaborador_nome}}</strong><br><span style="color:#8a8d99;font-size:7px">O Colaborador</span></td>
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
