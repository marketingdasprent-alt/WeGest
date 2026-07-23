-- ============================================================
-- Adiciona "COMBUSTÍVEL / BATERIA" à secção VIATURA do template
-- "Contrato Aluguer" (todas as empresas) — 5ª coluna na linha que
-- já tinha QUILÓMETROS / FRANQUIA / CAUÇÃO / KMS INCLUÍDOS.
-- ============================================================
-- Nível de combustível/bateria com que a viatura foi entregue ao
-- motorista, para constar no contrato assinado. O placeholder
-- {{viatura_combustivel_saida}} é resolvido em generateContratoPdf.ts:
-- mostra eletricidade_saida para elétricos/híbridos, combustivel_saida
-- para os restantes.
--
-- Substituição cirúrgica por string (replace), não um overwrite total do
-- template: os 7 templates "contrato_aluguer" já divergem entre si
-- (personalizados por empresa via editor visual), mas esta tabela em
-- concreto era idêntica nos 7 — confirmado antes de aplicar.
-- Idempotente: se a tabela já tiver as 5 colunas, o replace não encontra
-- o texto antigo (4 colunas) e não faz nada.
-- ============================================================

UPDATE public.document_templates t
SET template_data = jsonb_set(
  t.template_data,
  '{conteudo}',
  to_jsonb(
    replace(
      t.template_data->>'conteudo',
      '<table class="pdf-table" style="min-width: 100px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><td colspan="1" rowspan="1"><p class="editor-paragraph"><span style="font-size: 6px; color: rgb(138, 141, 153);">QUILÓMETROS</span><br><strong>{{viatura_kms}}</strong></p></td><td colspan="1" rowspan="1"><p class="editor-paragraph"><span style="font-size: 6px; color: rgb(138, 141, 153);">FRANQUIA</span><br><strong>{{franquia}}</strong></p></td><td colspan="1" rowspan="1"><p class="editor-paragraph"><span style="font-size: 6px; color: rgb(138, 141, 153);">CAUÇÃO</span><br><strong>{{caucao}}</strong></p></td><td colspan="1" rowspan="1"><p class="editor-paragraph"><span style="font-size: 6px; color: rgb(138, 141, 153);">KMS INCLUÍDOS</span><br><strong>{{kms_incluidos}}</strong></p></td></tr></tbody></table>',
      '<table class="pdf-table" style="min-width: 125px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><td colspan="1" rowspan="1"><p class="editor-paragraph"><span style="font-size: 6px; color: rgb(138, 141, 153);">QUILÓMETROS</span><br><strong>{{viatura_kms}}</strong></p></td><td colspan="1" rowspan="1"><p class="editor-paragraph"><span style="font-size: 6px; color: rgb(138, 141, 153);">FRANQUIA</span><br><strong>{{franquia}}</strong></p></td><td colspan="1" rowspan="1"><p class="editor-paragraph"><span style="font-size: 6px; color: rgb(138, 141, 153);">CAUÇÃO</span><br><strong>{{caucao}}</strong></p></td><td colspan="1" rowspan="1"><p class="editor-paragraph"><span style="font-size: 6px; color: rgb(138, 141, 153);">KMS INCLUÍDOS</span><br><strong>{{kms_incluidos}}</strong></p></td><td colspan="1" rowspan="1"><p class="editor-paragraph"><span style="font-size: 6px; color: rgb(138, 141, 153);">COMBUSTÍVEL / BATERIA</span><br><strong>{{viatura_combustivel_saida}}</strong></p></td></tr></tbody></table>'
    )
  )
)
WHERE t.tipo = 'contrato_aluguer';
