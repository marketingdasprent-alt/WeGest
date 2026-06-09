// Sincronização automática/manual via API/Apify das plataformas.
// DESATIVADA por decisão: só o import manual por CSV (wizard) deve funcionar.
// Esconde os botões de "Sincronizar" nos painéis de integração.
// Para reativar: pôr a true e reverter os guardas das edge functions
// (sync-orchestrator, robot-execute, bolt-sync, uber-webhook) + re-agendar o cron.
export const SINCRONIZACAO_ATIVA = false;
