
-- Drop and re-add FK constraints with ON DELETE CASCADE for all tables referencing plataformas_configuracao

ALTER TABLE bolt_viagens DROP CONSTRAINT bolt_viagens_integracao_id_fkey,
  ADD CONSTRAINT bolt_viagens_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE bolt_drivers DROP CONSTRAINT bolt_drivers_integracao_id_fkey,
  ADD CONSTRAINT bolt_drivers_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE bolt_vehicles DROP CONSTRAINT bolt_vehicles_integracao_id_fkey,
  ADD CONSTRAINT bolt_vehicles_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE bolt_mapeamento_motoristas DROP CONSTRAINT bolt_mapeamento_motoristas_integracao_id_fkey,
  ADD CONSTRAINT bolt_mapeamento_motoristas_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE bolt_sync_logs DROP CONSTRAINT bolt_sync_logs_integracao_id_fkey,
  ADD CONSTRAINT bolt_sync_logs_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_driver_compliance DROP CONSTRAINT uber_driver_compliance_integracao_id_fkey,
  ADD CONSTRAINT uber_driver_compliance_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE via_verde_contas DROP CONSTRAINT via_verde_contas_integracao_id_fkey,
  ADD CONSTRAINT via_verde_contas_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_viagens DROP CONSTRAINT uber_viagens_integracao_id_fkey,
  ADD CONSTRAINT uber_viagens_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_sync_logs DROP CONSTRAINT uber_sync_logs_integracao_id_fkey,
  ADD CONSTRAINT uber_sync_logs_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_drivers DROP CONSTRAINT uber_drivers_integracao_id_fkey,
  ADD CONSTRAINT uber_drivers_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_driver_tokens DROP CONSTRAINT uber_driver_tokens_integracao_id_fkey,
  ADD CONSTRAINT uber_driver_tokens_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_driver_profiles DROP CONSTRAINT uber_driver_profiles_integracao_id_fkey,
  ADD CONSTRAINT uber_driver_profiles_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_driver_risk_profiles DROP CONSTRAINT uber_driver_risk_profiles_integracao_id_fkey,
  ADD CONSTRAINT uber_driver_risk_profiles_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_vehicles DROP CONSTRAINT uber_vehicles_integracao_id_fkey,
  ADD CONSTRAINT uber_vehicles_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_vehicle_documents DROP CONSTRAINT uber_vehicle_documents_integracao_id_fkey,
  ADD CONSTRAINT uber_vehicle_documents_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_transactions DROP CONSTRAINT uber_transactions_integracao_id_fkey,
  ADD CONSTRAINT uber_transactions_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_webhook_events DROP CONSTRAINT uber_webhook_events_integracao_id_fkey,
  ADD CONSTRAINT uber_webhook_events_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_sync_cursors DROP CONSTRAINT uber_sync_cursors_integracao_id_fkey,
  ADD CONSTRAINT uber_sync_cursors_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_write_logs DROP CONSTRAINT uber_write_logs_integracao_id_fkey,
  ADD CONSTRAINT uber_write_logs_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE uber_atividade_motoristas DROP CONSTRAINT uber_atividade_motoristas_integracao_id_fkey,
  ADD CONSTRAINT uber_atividade_motoristas_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;

ALTER TABLE bp_cartoes DROP CONSTRAINT bp_cartoes_integracao_id_fkey,
  ADD CONSTRAINT bp_cartoes_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES plataformas_configuracao(id) ON DELETE CASCADE;
