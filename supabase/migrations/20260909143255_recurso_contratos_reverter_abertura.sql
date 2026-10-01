-- "Reverter abertura de contrato" passa a ser uma permissão como as outras.
--
-- O botão que devolve um contrato de em_curso a agendado não tinha permissão
-- nenhuma por trás: aparecia a toda a gente que conseguisse abrir o contrato.
-- É uma acção que desfaz a entrega da viatura e reabre o evento de entrega —
-- merece o mesmo controlo que "Reverter contrato para reserva" já tinha.
--
-- Fica no módulo Contratos, ao lado da irmã, para as duas se ligarem e
-- desligarem no mesmo sítio das Permissões.

INSERT INTO public.recursos (nome, descricao, categoria)
VALUES (
  'contratos_reverter_abertura',
  'Reverter a abertura de um contrato (volta a agendado)',
  'Contratos'
)
ON CONFLICT DO NOTHING;
