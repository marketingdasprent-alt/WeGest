-- Corrigir o template corrompido da Década Ousada
-- Substituir texto corrompido pelas versões corretas

UPDATE document_templates 
SET template_data = jsonb_set(
  template_data::jsonb,
  '{conteudo}',
  to_jsonb(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    template_data->>'conteudo',
                    'Primeiro Outorgan{{data_inicio}}te', 
                    'Primeiro Outorgante'
                  ),
                  'Ribeira Gran{{cidade_assinatura}}de',
                  'Ribeira Grande'
                ),
                'identi{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}ficadas',
                'identificadas'
              ),
              '{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}',
              ''
            ),
            '{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}{{data_assinatura}}',
            ''
          ),
          '{{data_assinatura}}{{data_assinatura}}',
          ''
        ),
        'iden{{data_assinatura}}tificadas',
        'identificadas'
      ),
      'identi{{data_assinatura}}ficadas',
      'identificadas'
    )
  )
),
updated_at = now()
WHERE id = '98c3ff4f-c6cf-4fea-ac65-b9372217edc8';