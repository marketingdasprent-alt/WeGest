export const BOLT_OPERATIONS = [
  'getDrivers',
  'getVehicles',
  'getCompanies',
  'getFleetStateLogs',
  'getFleetOrders',
] as const;

export type BoltOperation = (typeof BOLT_OPERATIONS)[number];

export interface BoltApiParams {
  start_ts?: number;
  end_ts?: number;
  limit?: number;
  offset?: number;
}

export interface BoltApiRequest {
  operation: BoltOperation;
  integracao_id: string;
  params: BoltApiParams;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} é obrigatório`);
  return value.trim();
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${field} inválido`);
  return Number(value);
}

export function parseBoltApiRequest(value: unknown): BoltApiRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Pedido inválido');
  }

  const input = value as Record<string, unknown>;
  const operation = requiredString(input.operation, 'operation');
  if (!BOLT_OPERATIONS.includes(operation as BoltOperation)) throw new Error('Operação inválida');

  const rawParams =
    input.params && typeof input.params === 'object' && !Array.isArray(input.params)
      ? (input.params as Record<string, unknown>)
      : {};
  const startTs = optionalInteger(rawParams.start_ts, 'start_ts');
  const endTs = optionalInteger(rawParams.end_ts, 'end_ts');
  const limit = optionalInteger(rawParams.limit, 'limit');
  const offset = optionalInteger(rawParams.offset, 'offset');
  if (limit !== undefined && (limit < 1 || limit > 500)) throw new Error('limit inválido');
  if (startTs !== undefined && endTs !== undefined && startTs > endTs) {
    throw new Error('Intervalo temporal inválido');
  }

  const params: BoltApiParams = {};
  if (startTs !== undefined) params.start_ts = startTs;
  if (endTs !== undefined) params.end_ts = endTs;
  if (limit !== undefined) params.limit = limit;
  if (offset !== undefined) params.offset = offset;

  return {
    operation: operation as BoltOperation,
    integracao_id: requiredString(input.integracao_id, 'integracao_id'),
    params,
  };
}

function arrayAt(result: Record<string, unknown>, key: string): unknown[] {
  const data = result.data;
  const nested = data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : null;
  const direct = result[key];
  if (Array.isArray(nested)) return nested;
  return Array.isArray(direct) ? direct : [];
}

export function buildBoltApiResponse(
  operation: BoltOperation,
  upstream: unknown,
): Record<string, unknown> {
  const result =
    upstream && typeof upstream === 'object' && !Array.isArray(upstream)
      ? (upstream as Record<string, unknown>)
      : {};
  const keyByOperation: Record<BoltOperation, string> = {
    getDrivers: 'drivers',
    getVehicles: 'vehicles',
    getCompanies: 'companies',
    getFleetStateLogs: 'logs',
    getFleetOrders: 'orders',
  };
  const key = keyByOperation[operation];
  const rows = arrayAt(result, key);
  const nestedData =
    result.data && typeof result.data === 'object'
      ? (result.data as Record<string, unknown>)
      : {};
  const reportedTotal = operation === 'getFleetOrders' ? nestedData.total_orders : undefined;

  return {
    [key]: rows,
    total: typeof reportedTotal === 'number' ? reportedTotal : rows.length,
  };
}
