interface BuildRobotIntegrationPayloadOptions {
  nome: string;
  login: string;
  password: string;
  robotTargetPlatform: string;
}

export interface RobotIntegrationPayload {
  nome: string;
  login: string;
  password: string;
  robot_target_platform: string;
}

export function buildRobotIntegrationPayload({
  nome,
  login,
  password,
  robotTargetPlatform,
}: BuildRobotIntegrationPayloadOptions): RobotIntegrationPayload {
  return {
    nome,
    login,
    password,
    robot_target_platform: robotTargetPlatform,
  };
}
