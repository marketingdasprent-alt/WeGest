export const ROBOT_TARGET_PLATFORMS = [
  "uber",
  "bolt",
  "bp",
  "repsol",
  "edp",
  "viaverde",
] as const;

export type RobotTargetPlatform = (typeof ROBOT_TARGET_PLATFORMS)[number];

export interface RobotIntegrationRequest {
  nome: string;
  login: string;
  password: string;
  robot_target_platform: RobotTargetPlatform;
}

interface SharedApifyCredential {
  apify_actor_id: string | null;
  apify_api_token: string | null;
}

export interface PublicApifyStatus {
  configurado: boolean;
  apify_actor_id: string | null;
}

const SITE_URLS: Record<RobotTargetPlatform, string | null> = {
  uber: "https://supplier.uber.com/",
  bolt: "https://fleets.bolt.eu/",
  bp: "https://www.bpplus.com/",
  repsol: "https://misolred.repsol.com/movimientos",
  edp: "https://empresas.edpcharge.edp.pt/home/consumption",
  viaverde: null,
};

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} é obrigatório`);
  }
  return value.trim();
}

export function parseRobotIntegrationRequest(
  value: unknown,
): RobotIntegrationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Pedido inválido");
  }

  const input = value as Record<string, unknown>;
  const robotTargetPlatform = requiredString(
    input.robot_target_platform,
    "robot_target_platform",
  );
  if (
    !ROBOT_TARGET_PLATFORMS.includes(robotTargetPlatform as RobotTargetPlatform)
  ) {
    throw new Error("Plataforma inválida");
  }

  return {
    nome: requiredString(input.nome, "nome"),
    login: requiredString(input.login, "login"),
    password: requiredString(input.password, "password"),
    robot_target_platform: robotTargetPlatform as RobotTargetPlatform,
  };
}

export function buildPublicApifyStatus(
  credential: SharedApifyCredential | null,
): PublicApifyStatus {
  return {
    configurado: Boolean(
      credential?.apify_actor_id && credential?.apify_api_token,
    ),
    apify_actor_id: credential?.apify_actor_id ?? null,
  };
}

export function buildRobotIntegrationInsert(
  request: RobotIntegrationRequest,
  credential: SharedApifyCredential,
  orgId: string,
  userId: string,
): Record<string, unknown> {
  if (!credential.apify_actor_id || !credential.apify_api_token) {
    throw new Error(
      `Sem credenciais Apify partilhadas para "${request.robot_target_platform}"`,
    );
  }

  return {
    nome: request.nome,
    plataforma: request.robot_target_platform === "viaverde"
      ? "via_verde"
      : "robot",
    ativo: true,
    apify_actor_id: credential.apify_actor_id,
    apify_api_token: null,
    auth_mode: "password",
    robot_target_platform: request.robot_target_platform,
    webhook_url: SITE_URLS[request.robot_target_platform],
    client_id: request.login,
    client_secret: request.password,
    cookies_json: null,
    org_id: orgId,
    criado_por: userId,
  };
}
