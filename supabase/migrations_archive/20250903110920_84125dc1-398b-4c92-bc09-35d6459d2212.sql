-- Configurar tabelas para realtime
ALTER TABLE leads_dasprent REPLICA IDENTITY FULL;
ALTER TABLE lead_status_history REPLICA IDENTITY FULL;
ALTER TABLE profiles REPLICA IDENTITY FULL;