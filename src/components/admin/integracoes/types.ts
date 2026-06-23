export type PlataformaIntegracao = 'bolt' | 'uber' | 'via_verde' | 'combustivel' | 'robot';

// Available platforms for creation — internally stored as 'robot' with robot_target_platform
// (exceto 'viaverde', que é manual: armazenada como plataforma='viaverde', sem robot/credenciais)
export type PlataformaOperacional = 'uber' | 'bolt' | 'bp' | 'repsol' | 'edp' | 'viaverde';

export interface IntegracaoConfig {
  id: string;
  nome: string;
  plataforma: PlataformaIntegracao;
  client_id: string | null;
  client_secret: string | null;
  company_id: number | null;
  company_name: string | null;
  ativo: boolean;
  ultimo_sync: string | null;
  sync_automatico: boolean | null;
  intervalo_sync_horas: number | null;
  oauth_enabled: boolean;
  uber_scopes: string[] | null;
  redirect_uri: string | null;
  privacy_policy_url: string | null;
  webhook_url: string | null;
  uber_environment: string | null;
  oauth_state_secret_hint: string | null;
  webhook_secret_hint: string | null;
  encryption_key_fingerprint: string | null;
  last_oauth_at: string | null;
  last_webhook_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  apify_actor_id: string | null;
  apify_api_token?: string | null;
  auth_mode?: string | null;
  cookies_json?: string | null;
  logo_url?: string | null;
  robot_target_platform?: string | null;
  webhook_signing_key?: string | null;
}

// Pre-configured defaults for Uber integrations (stored as robot internally)
export const UBER_DEFAULTS = {
  apify_actor_id: 'V0XdIalMut9LfL17V',
  site_url: 'https://supplier.uber.com/',
  auth_mode: 'password' as const,
  robot_target_platform: 'uber',
  apify_api_token: 'apify_api_zyXNhVu0c2aYqhETTy6fgfDI5ZNrOA3DM0vc',
};

// Pre-configured defaults for Bolt integrations (stored as robot internally)
export const BOLT_DEFAULTS = {
  apify_actor_id: 'eaeRDaDAU3jqGqWoc',
  site_url: 'https://fleets.bolt.eu/',
  auth_mode: 'password' as const,
  robot_target_platform: 'bolt',
  apify_api_token: 'apify_api_zyXNhVu0c2aYqhETTy6fgfDI5ZNrOA3DM0vc',
};

// Pre-configured defaults for BP integrations (stored as robot internally)
export const BP_DEFAULTS = {
  apify_actor_id: 'hKRIfwsrS4gr3fsRK',
  site_url: 'https://www.bpplus.com/',
  auth_mode: 'password' as const,
  robot_target_platform: 'bp',
  apify_api_token: 'apify_api_zyXNhVu0c2aYqhETTy6fgfDI5ZNrOA3DM0vc',
};

// Pre-configured defaults for Repsol integrations
export const REPSOL_DEFAULTS = {
  apify_actor_id: 'E6AO5pXQ55KnXO1fG',
  site_url: 'https://misolred.repsol.com/movimientos',
  auth_mode: 'password' as const,
  robot_target_platform: 'repsol',
  apify_api_token: 'apify_api_zyXNhVu0c2aYqhETTy6fgfDI5ZNrOA3DM0vc',
};

// Pre-configured defaults for EDP integrations
export const EDP_DEFAULTS = {
  apify_actor_id: '9Jfy0dN84fZJxF1Xr',
  site_url: 'https://empresas.edpcharge.edp.pt/home/consumption',
  auth_mode: 'password' as const,
  robot_target_platform: 'edp',
  apify_api_token: 'apify_api_zyXNhVu0c2aYqhETTy6fgfDI5ZNrOA3DM0vc',
};

// Via Verde — importação manual (sem robot/scraping, sem credenciais).
export const VIAVERDE_DEFAULTS = {
  manual: true as const,
  robot_target_platform: 'viaverde',
};
