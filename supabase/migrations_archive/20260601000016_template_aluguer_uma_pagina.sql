-- ============================================================
-- Template "Contrato Aluguer" — UMA página, layout premium
-- ============================================================
-- Só a folha de Condições Particulares (sem as Condições Gerais), desenhada
-- para caber numa página e replicar o design aprovado:
--   • Cabeçalho: logo à esquerda + "Nº" grande à direita
--   • CLIENTE / CONDUTOR em 4 colunas (NIF | TELEMÓVEL lado a lado)
--   • Período com estação (levantamento/devolução) + data
--   • Cabeçalhos de secção cinza, divisórias finas
--   • TOTAL A PAGAR destacado, assinaturas à esquerda + declaração
-- O rodapé da empresa (NIF/sede) e a numeração são desenhados pelo motor.
--
-- ::text força o tipo do literal (senão `unknown` → erro 42804 em to_jsonb).
-- Idempotente (substitui sempre pelo mesmo conteúdo).
-- ============================================================

UPDATE public.document_templates t
SET template_data = jsonb_set(
  t.template_data,
  '{conteudo}',
  to_jsonb(
    $PART$<table>
<tr>
<td></td>
<td style="text-align:right"><span style="color:#8a8d99;font-size:8px"><strong>CONTRATO DE ALUGUER</strong></span><br><span style="color:#2b3a6b;font-size:15px"><strong>N.º {{numero_contrato}}</strong></span><br><span style="color:#8a8d99;font-size:8px">{{data_inicio}} — {{data_fim}}</span></td>
</tr>
</table>
<hr>
<table>
<tr>
<td><span style="color:#8a8d99;font-size:8px"><strong>CLIENTE</strong></span><br><span style="font-size:13px"><strong>{{motorista_nome}}</strong></span><br><br><span style="color:#8a8d99;font-size:6px">NIF</span><br><strong>{{motorista_nif}}</strong><br><br><span style="color:#8a8d99;font-size:6px">TELEMÓVEL</span><br><strong>{{motorista_telefone}}</strong><br><br><span style="color:#8a8d99;font-size:6px">MORADA</span><br><strong>{{motorista_morada}}</strong><br><br><span style="color:#8a8d99;font-size:6px">EMAIL</span><br><strong>{{motorista_email}}</strong></td>
<td><span style="color:#8a8d99;font-size:8px"><strong>CONDUTOR</strong></span><br><span style="font-size:13px"><strong>{{motorista_nome}}</strong></span><br><br><span style="color:#8a8d99;font-size:6px">NIF</span><br><strong>{{motorista_nif}}</strong><br><br><span style="color:#8a8d99;font-size:6px">TELEMÓVEL</span><br><strong>{{motorista_telefone}}</strong><br><br><span style="color:#8a8d99;font-size:6px">MORADA</span><br><strong>{{motorista_morada}}</strong><br><br><span style="color:#8a8d99;font-size:6px">EMAIL</span><br><strong>{{motorista_email}}</strong></td>
</tr>
</table>
<hr>
<p style="color:#8a8d99;font-size:8px"><strong>PERÍODO DE ALUGUER</strong></p>
<table><tr>
<td><span style="color:#8a8d99;font-size:6px">LEVANTAMENTO</span><br><strong>{{local_entrega}}</strong><br><span style="color:#8a8d99;font-size:8px">{{data_inicio}}</span></td>
<td><span style="color:#8a8d99;font-size:6px">DEVOLUÇÃO</span><br><strong>{{local_recolha}}</strong><br><span style="color:#8a8d99;font-size:8px">{{data_fim}}</span></td>
<td><span style="color:#8a8d99;font-size:6px">DURAÇÃO</span><br><strong>{{dias}} dia(s)</strong></td>
</tr></table>
<hr>
<p style="color:#8a8d99;font-size:8px"><strong>VIATURA</strong></p>
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
<p style="color:#8a8d99;font-size:8px"><strong>FATURAÇÃO</strong></p>
<table>
<tr><td><span style="color:#5a5d68;font-size:9px">Tarifa diária × {{dias}} dia(s)</span></td><td style="text-align:right"><strong>{{tarifa_diaria}}</strong></td></tr>
<tr><td><span style="color:#5a5d68;font-size:9px">Subtotal</span></td><td style="text-align:right"><strong>{{subtotal}}</strong></td></tr>
<tr><td><span style="color:#5a5d68;font-size:9px">IVA</span></td><td style="text-align:right"><strong>{{iva}}</strong></td></tr>
</table>
<hr>
<table><tr>
<td><span style="color:#8a8d99;font-size:9px"><strong>TOTAL A PAGAR</strong></span></td>
<td style="text-align:right"><span style="color:#2b3a6b;font-size:15px"><strong>{{total}}</strong></span></td>
</tr></table>
<p style="text-align:center;color:#8a8d99;font-size:8px">O cliente declara ter lido e aceitar as condições gerais constantes deste contrato e respetivos anexos.</p>
<table><tr>
<td>___________________________<br><strong>{{motorista_nome}}</strong><br><span style="color:#8a8d99;font-size:7px">O Cliente</span></td>
<td>___________________________<br><strong>{{colaborador_nome}}</strong><br><span style="color:#8a8d99;font-size:7px">O Colaborador</span></td>
</tr></table>
$PART$::text
  )
)
WHERE t.tipo = 'contrato_aluguer'
  AND t.template_data ? 'conteudo';
