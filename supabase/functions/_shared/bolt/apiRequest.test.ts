import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { buildBoltApiResponse, parseBoltApiRequest } from './apiRequest.ts';

Deno.test('pedido Bolt exige uma integração explícita', () => {
  assertThrows(
    () => parseBoltApiRequest({ operation: 'getDrivers' }),
    Error,
    'integracao_id é obrigatório',
  );
});

Deno.test('pedido Bolt aceita apenas operações conhecidas', () => {
  assertThrows(
    () => parseBoltApiRequest({ operation: 'deleteEverything', integracao_id: 'integration-1' }),
    Error,
    'Operação inválida',
  );
});

Deno.test('pedido Bolt limita paginação controlada pelo cliente', () => {
  assertThrows(
    () =>
      parseBoltApiRequest({
        operation: 'getDrivers',
        integracao_id: 'integration-1',
        params: { limit: 501 },
      }),
    Error,
    'limit inválido',
  );
});

Deno.test('pedido Bolt rejeita intervalos temporais invertidos', () => {
  assertThrows(
    () =>
      parseBoltApiRequest({
        operation: 'getFleetOrders',
        integracao_id: 'integration-1',
        params: { start_ts: 200, end_ts: 100 },
      }),
    Error,
    'Intervalo temporal inválido',
  );
});

Deno.test('pedido Bolt normaliza apenas parâmetros suportados', () => {
  assertEquals(
    parseBoltApiRequest({
      operation: 'getVehicles',
      integracao_id: ' integration-1 ',
      params: { start_ts: 100, end_ts: 200, limit: 50, offset: 10, secret: 'drop' },
    }),
    {
      operation: 'getVehicles',
      integracao_id: 'integration-1',
      params: { start_ts: 100, end_ts: 200, limit: 50, offset: 10 },
    },
  );
});

Deno.test('resposta Bolt remove payload raw e credenciais', () => {
  assertEquals(
    buildBoltApiResponse('getDrivers', {
      data: { drivers: [{ driver_uuid: 'driver-1' }] },
      access_token: 'não-pode-sair',
      client_secret: 'não-pode-sair',
    }),
    { drivers: [{ driver_uuid: 'driver-1' }], total: 1 },
  );
});

Deno.test('resposta Bolt normaliza todos os tipos permitidos', () => {
  assertEquals(buildBoltApiResponse('getVehicles', { vehicles: [{ id: 'v1' }] }), {
    vehicles: [{ id: 'v1' }],
    total: 1,
  });
  assertEquals(buildBoltApiResponse('getCompanies', { data: { companies: [{ id: 'c1' }] } }), {
    companies: [{ id: 'c1' }],
    total: 1,
  });
  assertEquals(buildBoltApiResponse('getFleetStateLogs', { data: { logs: [{ id: 'l1' }] } }), {
    logs: [{ id: 'l1' }],
    total: 1,
  });
  assertEquals(
    buildBoltApiResponse('getFleetOrders', {
      data: { orders: [{ id: 'o1' }], total_orders: 9 },
    }),
    { orders: [{ id: 'o1' }], total: 9 },
  );
});
