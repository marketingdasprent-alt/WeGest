
-- =============================================
-- Merge duplicate motoristas_ativos records
-- Re-point all FK references then delete duplicates
-- =============================================

-- Helper: re-point all FK tables from old_id to new_id
-- We'll do this for each duplicate group

-- Group 1: Gil Gonçalves (keep b1d83835) ← Gil Antonio Semedo Gonçalves (delete 3224ebae)
UPDATE public.assistencia_tickets SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.bolt_drivers SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.bolt_mapeamento_motoristas SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.bolt_viagens SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.bp_cartoes SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.bp_transacoes SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.contratos SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.motorista_documentos SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.motorista_financeiro SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.motorista_recibos SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.motorista_viaturas SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.uber_driver_compliance SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.uber_driver_profiles SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.uber_driver_risk_profiles SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.uber_driver_tokens SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.uber_drivers SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.uber_transactions SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.uber_viagens SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.viatura_danos SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.viatura_multas SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
UPDATE public.viatura_reservas SET motorista_id = 'b1d83835-2076-4398-b579-79490eeec80e' WHERE motorista_id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';
DELETE FROM public.motoristas_ativos WHERE id = '3224ebae-f8f7-4929-8b8e-db37a3c83bda';

-- Group 2: Gílberto Djú (keep f41c1b6b) ← GILBERTO PINTO DJU (delete 02c63936)
UPDATE public.assistencia_tickets SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.bolt_drivers SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.bolt_mapeamento_motoristas SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.bolt_viagens SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.bp_cartoes SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.bp_transacoes SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.contratos SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.motorista_documentos SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.motorista_financeiro SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.motorista_recibos SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.motorista_viaturas SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.uber_driver_compliance SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.uber_driver_profiles SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.uber_driver_risk_profiles SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.uber_driver_tokens SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.uber_drivers SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.uber_transactions SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.uber_viagens SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.viatura_danos SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.viatura_multas SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
UPDATE public.viatura_reservas SET motorista_id = 'f41c1b6b-470f-4bb3-a108-6fe413103651' WHERE motorista_id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';
DELETE FROM public.motoristas_ativos WHERE id = '02c63936-8b9a-41ac-a60b-3fe7726a6253';

-- Group 3: Gisele Machado (keep 9f1113a1) ← Gisele Cursino Machado (delete a35c103e)
UPDATE public.assistencia_tickets SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.bolt_drivers SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.bolt_mapeamento_motoristas SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.bolt_viagens SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.bp_cartoes SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.bp_transacoes SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.contratos SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.motorista_documentos SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.motorista_financeiro SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.motorista_recibos SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.motorista_viaturas SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.uber_driver_compliance SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.uber_driver_profiles SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.uber_driver_risk_profiles SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.uber_driver_tokens SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.uber_drivers SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.uber_transactions SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.uber_viagens SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.viatura_danos SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.viatura_multas SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
UPDATE public.viatura_reservas SET motorista_id = '9f1113a1-f12d-4b3d-a14f-9c045714613d' WHERE motorista_id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';
DELETE FROM public.motoristas_ativos WHERE id = 'a35c103e-cd61-4f09-9c3a-05f5029f7a72';

-- Group 4: Khalid Issa (keep fe4b831f) ← Khalid Muayad Issa Issa x2 (delete 37b5b050, 52fd0db0)
UPDATE public.assistencia_tickets SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.bolt_drivers SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.bolt_mapeamento_motoristas SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.bolt_viagens SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.bp_cartoes SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.bp_transacoes SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.contratos SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.motorista_documentos SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.motorista_financeiro SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.motorista_recibos SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.motorista_viaturas SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.uber_driver_compliance SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.uber_driver_profiles SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.uber_driver_risk_profiles SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.uber_driver_tokens SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.uber_drivers SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.uber_transactions SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.uber_viagens SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.viatura_danos SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.viatura_multas SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
UPDATE public.viatura_reservas SET motorista_id = 'fe4b831f-f4cd-4541-b105-bd3d8ec93431' WHERE motorista_id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');
DELETE FROM public.motoristas_ativos WHERE id IN ('37b5b050-f630-4733-868e-e923c5a9446e', '52fd0db0-6f2d-4d74-94e3-ac52e2fa1409');

-- Group 5: Ângela Sousa — keep first (7bd6fc3d), delete second (ced0f809)
UPDATE public.assistencia_tickets SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.bolt_drivers SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.bolt_mapeamento_motoristas SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.bolt_viagens SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.bp_cartoes SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.bp_transacoes SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.contratos SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.motorista_documentos SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.motorista_financeiro SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.motorista_recibos SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.motorista_viaturas SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.uber_driver_compliance SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.uber_driver_profiles SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.uber_driver_risk_profiles SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.uber_driver_tokens SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.uber_drivers SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.uber_transactions SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.uber_viagens SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.viatura_danos SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.viatura_multas SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
UPDATE public.viatura_reservas SET motorista_id = '7bd6fc3d-26dd-491b-b800-4e3244d37059' WHERE motorista_id = 'ced0f809-5904-4d73-a25c-47debc07c330';
DELETE FROM public.motoristas_ativos WHERE id = 'ced0f809-5904-4d73-a25c-47debc07c330';

-- Group 6: Joelan Nardir — keep first (795da834), delete second (08cb44eb)
UPDATE public.assistencia_tickets SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.bolt_drivers SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.bolt_mapeamento_motoristas SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.bolt_viagens SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.bp_cartoes SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.bp_transacoes SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.contratos SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.motorista_documentos SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.motorista_financeiro SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.motorista_recibos SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.motorista_viaturas SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.uber_driver_compliance SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.uber_driver_profiles SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.uber_driver_risk_profiles SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.uber_driver_tokens SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.uber_drivers SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.uber_transactions SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.uber_viagens SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.viatura_danos SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.viatura_multas SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
UPDATE public.viatura_reservas SET motorista_id = '795da834-4533-4eed-8862-4f00940a29ec' WHERE motorista_id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';
DELETE FROM public.motoristas_ativos WHERE id = '08cb44eb-8060-4fe4-a87c-524e513b94f5';

-- Group 7: Renata Fonseca da Cruz — keep first (a0f41cd3), delete second (a13f2b37)
UPDATE public.assistencia_tickets SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.bolt_drivers SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.bolt_mapeamento_motoristas SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.bolt_viagens SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.bp_cartoes SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.bp_transacoes SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.contratos SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.motorista_documentos SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.motorista_financeiro SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.motorista_recibos SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.motorista_viaturas SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.uber_driver_compliance SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.uber_driver_profiles SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.uber_driver_risk_profiles SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.uber_driver_tokens SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.uber_drivers SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.uber_transactions SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.uber_viagens SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.viatura_danos SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.viatura_multas SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
UPDATE public.viatura_reservas SET motorista_id = 'a0f41cd3-f31e-49b4-92bc-17ebd13025c0' WHERE motorista_id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
DELETE FROM public.motoristas_ativos WHERE id = 'a13f2b37-5084-4e79-874b-91a7a81f0e26';
