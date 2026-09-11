import { describe, expect, it } from 'vitest';

import { buildRobotIntegrationPayload } from './robotIntegrationPayload';

describe('buildRobotIntegrationPayload', () => {
  it('envia só os campos necessários e nunca inclui o token Apify', () => {
    expect(
      buildRobotIntegrationPayload({
        nome: 'Conta Uber',
        login: 'gestor@example.pt',
        password: 'senha',
        robotTargetPlatform: 'uber',
      })
    ).toEqual({
      nome: 'Conta Uber',
      login: 'gestor@example.pt',
      password: 'senha',
      robot_target_platform: 'uber',
    });
  });
});
