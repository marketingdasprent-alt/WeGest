import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-uber-signature",
};

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];
type JsonRecord = Record<string, JsonValue>;
type UpsertCount = { inserted: number; updated: number };
type Lookups = {
  motoristasByEmail: Map<string, string>;
  motoristasByPhone: Map<string, string>;
  motoristasByName: Map<string, string>;
  viaturasByPlate: Map<string, string>;
  uberDriverToMotorista: Map<string, string>;
  uberVehicleToViatura: Map<string, string>;
};
type ProcessResult = {
  counts: {
    drivers: UpsertCount;
    vehicles: UpsertCount;
    transactions: UpsertCount;
  };
  diagnostics?: Record<string, unknown>;
  domain: "driver" | "vehicle" | "transaction" | "unknown";
  message: string;
  status: "processed" | "ignored" | "failed";
};

type StoredWebhookEvent = {
  id: string;
  integracao_id: string;
  event_id: string | null;
  event_type: string;
  payload: JsonRecord;
};

const textEncoder = new TextEncoder();
const COMMON_WRAPPER_PATHS = [
  "data",
  "body",
  "resource",
  "entity",
  "payload",
  "detail",
  "details",
  "object",
  "event",
  "message",
  "attributes",
  "meta",
  "context",
  "result",
  "record",
  "item",
] as const;
const DRIVER_SHAPE_PATHS = [
  "driverId",
  "driver_id",
  "partnerId",
  "partner_id",
  "earnerId",
  "earner_id",
  "userId",
  "user_id",
  "uuid",
  "driver.id",
  "driver.uuid",
  "partner.id",
  "partner.uuid",
  "earner.id",
  "earner.uuid",
  "firstName",
  "first_name",
  "fullName",
  "full_name",
  "email",
  "contact.email",
  "phone",
  "contact.phone",
  "phone.number",
  "onboardingStatus",
  "driverStatus",
  "rating",
] as const;
const VEHICLE_SHAPE_PATHS = [
  "vehicleId",
  "vehicle_id",
  "carId",
  "car_id",
  "fleetVehicleId",
  "fleet_vehicle_id",
  "uuid",
  "vehicle.id",
  "vehicle.uuid",
  "car.id",
  "car.uuid",
  "licensePlate",
  "license_plate",
  "vehicle.licensePlate",
  "registrationNumber",
  "registration_number",
  "plate",
  "make",
  "model",
  "year",
  "status",
] as const;
const TRANSACTION_SHAPE_PATHS = [
  "transactionId",
  "transaction_id",
  "paymentId",
  "payment_id",
  "earningId",
  "earning_id",
  "payoutId",
  "payout_id",
  "statementId",
  "statement_id",
  "uuid",
  "tripReference",
  "trip_reference",
  "tripId",
  "trip_id",
  "payment.id",
  "payout.id",
  "trip.id",
  "grossAmount",
  "grossAmount.amount",
  "netAmount",
  "netAmount.amount",
  "amount",
  "currency",
  "status",
] as const;

const emptyCounts = () => ({
  drivers: { inserted: 0, updated: 0 },
  vehicles: { inserted: 0, updated: 0 },
  transactions: { inserted: 0, updated: 0 },
});

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeSignature = (signature: string | null) =>
  signature?.trim().replace(/^sha256=/i, "").replace(/^v1=/i, "") ?? "";

const hexToBytes = (hex: string) => {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
};

const safeEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
};

const createHmacSha256 = async (secret: string, payload: string) => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(payload)),
  );
};

const isValidUberSignature = async (secret: string, payload: string, signature: string | null) => {
  const normalizedSignature = normalizeSignature(signature);
  if (!normalizedSignature) return false;

  const expectedBytes = await createHmacSha256(secret, payload);
  const signatureBytes = hexToBytes(normalizedSignature);

  if (signatureBytes) {
    return safeEqual(expectedBytes, signatureBytes);
  }

  const expectedBase64 = btoa(String.fromCharCode(...expectedBytes));
  return expectedBase64 === normalizedSignature;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getByPath = (source: unknown, dottedPath: string) => {
  return dottedPath.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return null;
    return current[segment] ?? null;
  }, source);
};

const getCandidateRecords = (payload: JsonRecord, paths: readonly string[]) => {
  const records: JsonRecord[] = [];
  const seen = new WeakSet<object>();

  const pushRecord = (value: unknown) => {
    if (isRecord(value) && !seen.has(value)) {
      seen.add(value);
      records.push(value);
    }
  };

  for (const path of paths) {
    const value = getByPath(payload, path);
    if (Array.isArray(value)) {
      value.forEach(pushRecord);
      continue;
    }
    pushRecord(value);
  }

  return records;
};

const collectNestedRecords = (
  value: unknown,
  maxDepth = 5,
  seen = new WeakSet<object>(),
  records: JsonRecord[] = [],
): JsonRecord[] => {
  if (maxDepth < 0) return records;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectNestedRecords(item, maxDepth - 1, seen, records);
    }
    return records;
  }

  if (!isRecord(value) || seen.has(value)) {
    return records;
  }

  seen.add(value);
  records.push(value);

  for (const nestedValue of Object.values(value)) {
    collectNestedRecords(nestedValue, maxDepth - 1, seen, records);
  }

  return records;
};

const getSearchSources = (payload: JsonRecord, preferredPaths: readonly string[]) => {
  const directRecords = getCandidateRecords(payload, [...preferredPaths, ...COMMON_WRAPPER_PATHS]);
  const nestedRecords = collectNestedRecords(payload);
  return Array.from(new Set<unknown>([...directRecords, payload, ...nestedRecords]));
};

const asTrimmedString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
};

const asNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const firstString = (sources: unknown[], paths: readonly string[]) => {
  for (const source of sources) {
    for (const path of paths) {
      const value = asTrimmedString(getByPath(source, path));
      if (value) return value;
    }
  }
  return null;
};

const firstNumber = (sources: unknown[], paths: readonly string[]) => {
  for (const source of sources) {
    for (const path of paths) {
      const value = asNumber(getByPath(source, path));
      if (value !== null) return value;
    }
  }
  return null;
};

const normalizePhone = (input?: string | null) => {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (/^351\d{9}$/.test(digits)) return digits.slice(-9);
  if (/^0\d{9}$/.test(digits)) return digits.slice(-9);
  return digits;
};

const normalizePlate = (input?: string | null) => {
  const normalized = (input ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return normalized || null;
};

const normalizeName = (input?: string | null): string => {
  if (!input) return '';
  return input.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
};

const buildPhone = (value: unknown) => {
  if (typeof value === "string") return value.trim() || null;
  if (!isRecord(value)) return null;

  const countryCode =
    asTrimmedString(value.countryCode)
    ?? asTrimmedString(value.country_code)
    ?? asTrimmedString(value.callingCode)
    ?? asTrimmedString(value.calling_code)
    ?? "";
  const number =
    asTrimmedString(value.number)
    ?? asTrimmedString(value.phoneNumber)
    ?? asTrimmedString(value.phone_number)
    ?? asTrimmedString(value.value)
    ?? "";
  const result = `${countryCode}${number}`.trim();
  return result || null;
};

const firstPhone = (sources: unknown[], paths: readonly string[]) => {
  for (const source of sources) {
    for (const path of paths) {
      const rawValue = getByPath(source, path);
      const phone = buildPhone(rawValue) ?? asTrimmedString(rawValue);
      if (phone) return phone;
    }
  }
  return null;
};

const amountToNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (!isRecord(value)) return null;

  const directAmount = asNumber(value.amount);
  if (directAmount !== null) return directAmount;

  const amountE5 = asNumber(value.amountE5 ?? value.amount_e5);
  if (amountE5 !== null) return Number((amountE5 / 100000).toFixed(5));

  const units = asNumber(value.units);
  const nanos = asNumber(value.nanos);
  if (units !== null) {
    return Number((units + (nanos ?? 0) / 1_000_000_000).toFixed(9));
  }

  const nestedAmount = amountToNumber(value.value);
  return nestedAmount;
};

const firstAmount = (sources: unknown[], paths: readonly string[]) => {
  for (const source of sources) {
    for (const path of paths) {
      const value = amountToNumber(getByPath(source, path));
      if (value !== null) return value;
    }
  }
  return null;
};

const asIsoDate = (value: unknown) => {
  const dateString = asTrimmedString(value);
  if (!dateString) return null;
  const parsed = new Date(dateString);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const firstIsoDate = (sources: unknown[], paths: readonly string[]) => {
  for (const source of sources) {
    for (const path of paths) {
      const value = asIsoDate(getByPath(source, path));
      if (value) return value;
    }
  }
  return null;
};

const recordMatchesShape = (source: unknown, paths: readonly string[]) =>
  paths.some((path) => getByPath(source, path) !== null && getByPath(source, path) !== undefined);

const prioritizeSources = (sources: unknown[], shapePaths: readonly string[]) => {
  const prioritized = sources.filter((source) => recordMatchesShape(source, shapePaths));
  return prioritized.length > 0 ? prioritized : sources;
};

const getEventId = (payload: JsonRecord, headers: Headers) => {
  const payloadEventId = payload.event_id ?? payload.id ?? payload.eventId;
  if (typeof payloadEventId === "string" && payloadEventId.trim()) {
    return payloadEventId.trim();
  }

  const headerEventId = headers.get("x-uber-event-id") ?? headers.get("x-event-id");
  return headerEventId?.trim() || null;
};

const getEventType = (payload: JsonRecord) => {
  const payloadType = payload.event_type ?? payload.type ?? payload.eventType;
  return typeof payloadType === "string" && payloadType.trim() ? payloadType.trim() : "unknown";
};

const headersToObject = (headers: Headers) => Object.fromEntries(headers.entries());

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const requireUserId = async (req: Request, supabaseUrl: string, anonKey: string) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Sessão inválida. Inicie sessão novamente.");
  }

  const token = authHeader.replace("Bearer ", "");
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await authClient.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Error("Sessão inválida. Inicie sessão novamente.");
  }

  return data.claims.sub;
};

const loadLookups = async (supabase: ReturnType<typeof createClient>, integracaoId: string): Promise<Lookups> => {
  const [
    { data: motoristasData, error: motoristasError },
    { data: viaturasData, error: viaturasError },
    { data: uberDriversData, error: uberDriversError },
    { data: uberVehiclesData, error: uberVehiclesError },
  ] = await Promise.all([
    supabase.from("motoristas_ativos").select("id, email, telefone, nome").eq("status_ativo", true),
    supabase.from("viaturas").select("id, matricula"),
    supabase.from("uber_drivers").select("uber_driver_id, motorista_id").eq("integracao_id", integracaoId).not("motorista_id", "is", null),
    supabase.from("uber_vehicles").select("uber_vehicle_id, viatura_id").eq("integracao_id", integracaoId).not("viatura_id", "is", null),
  ]);

  if (motoristasError) throw new Error("Não foi possível carregar os motoristas locais.");
  if (viaturasError) throw new Error("Não foi possível carregar as viaturas locais.");
  if (uberDriversError) throw new Error("Não foi possível carregar o mapeamento Uber de motoristas.");
  if (uberVehiclesError) throw new Error("Não foi possível carregar o mapeamento Uber de viaturas.");

  const motoristasByEmail = new Map<string, string>();
  const motoristasByPhone = new Map<string, string>();
  const motoristasByName = new Map<string, string>();
  const viaturasByPlate = new Map<string, string>();
  const uberDriverToMotorista = new Map<string, string>();
  const uberVehicleToViatura = new Map<string, string>();

  for (const motorista of motoristasData ?? []) {
    const email = typeof motorista.email === "string" ? motorista.email.trim().toLowerCase() : "";
    const phone = normalizePhone(typeof motorista.telefone === "string" ? motorista.telefone : null);
    const name = normalizeName(typeof motorista.nome === "string" ? motorista.nome : null);
    if (email && !motoristasByEmail.has(email)) motoristasByEmail.set(email, motorista.id);
    if (phone && !motoristasByPhone.has(phone)) motoristasByPhone.set(phone, motorista.id);
    if (name && !motoristasByName.has(name)) motoristasByName.set(name, motorista.id);
  }

  for (const viatura of viaturasData ?? []) {
    const plate = normalizePlate(typeof viatura.matricula === "string" ? viatura.matricula : null);
    if (plate && !viaturasByPlate.has(plate)) viaturasByPlate.set(plate, viatura.id);
  }

  for (const uberDriver of uberDriversData ?? []) {
    if (typeof uberDriver.uber_driver_id === "string" && typeof uberDriver.motorista_id === "string") {
      uberDriverToMotorista.set(uberDriver.uber_driver_id, uberDriver.motorista_id);
    }
  }

  for (const uberVehicle of uberVehiclesData ?? []) {
    if (typeof uberVehicle.uber_vehicle_id === "string" && typeof uberVehicle.viatura_id === "string") {
      uberVehicleToViatura.set(uberVehicle.uber_vehicle_id, uberVehicle.viatura_id);
    }
  }

  return { motoristasByEmail, motoristasByPhone, motoristasByName, viaturasByPlate, uberDriverToMotorista, uberVehicleToViatura };
};

const upsertRows = async ({
  supabase,
  table,
  integracaoId,
  idColumn,
  onConflict,
  rows,
}: {
  supabase: ReturnType<typeof createClient>;
  table: string;
  integracaoId: string;
  idColumn: string;
  onConflict: string;
  rows: Record<string, unknown>[];
}) => {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const ids = rows
    .map((row) => row[idColumn])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const existing = new Set<string>();

  for (const chunk of chunkArray(Array.from(new Set(ids)), 200)) {
    const { data, error } = await supabase
      .from(table)
      .select(idColumn)
      .eq("integracao_id", integracaoId)
      .in(idColumn, chunk);

    if (error) throw new Error(`Não foi possível verificar registos existentes em ${table}.`);
    for (const row of data ?? []) {
      const value = row?.[idColumn];
      if (typeof value === "string") existing.add(value);
    }
  }

  try {
    for (const chunk of chunkArray(rows, 200)) {
      const { error } = await supabase.from(table).upsert(chunk, {
        onConflict,
        ignoreDuplicates: false,
      });

      if (error) throw error;
    }
  } catch (upsertError) {
    console.warn(`[upsertRows] upsert falhou em ${table}, tentando fallback individual:`, upsertError);
    for (const row of rows) {
      const identifier = row[idColumn];
      if (typeof identifier !== "string" || !identifier) continue;

      if (existing.has(identifier)) {
        const { error } = await supabase
          .from(table)
          .update(row)
          .eq("integracao_id", integracaoId)
          .eq(idColumn, identifier);

        if (error) {
          console.error(`[upsertRows] update falhou em ${table}:`, JSON.stringify(error));
          throw new Error(`Não foi possível actualizar dados em ${table}: ${error.message} (code: ${error.code})`);
        }
      } else {
        const { error } = await supabase.from(table).insert(row);
        if (error) {
          console.error(`[upsertRows] insert falhou em ${table}:`, JSON.stringify(error));
          throw new Error(`Não foi possível guardar dados em ${table}: ${error.message} (code: ${error.code})`);
        }
        existing.add(identifier);
      }
    }
  }

  const updated = ids.filter((value) => existing.has(value)).length;
  return { inserted: ids.length - updated, updated };
};

const findInterestingPayloadPaths = (
  value: unknown,
  currentPath = "",
  depth = 0,
  results: string[] = [],
): string[] => {
  if (depth > 5 || results.length >= 40) return results;

  if (Array.isArray(value)) {
    value.slice(0, 5).forEach((item, index) => {
      findInterestingPayloadPaths(item, `${currentPath}[${index}]`, depth + 1, results);
    });
    return results;
  }

  if (!isRecord(value)) {
    if (currentPath) results.push(currentPath);
    return results;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const path = currentPath ? `${currentPath}.${key}` : key;
    if (/(driver|vehicle|car|plate|trip|transaction|payment|earning|amount|gross|net|fee|commission|email|phone|status|city|name|id|uuid)/i.test(key)) {
      if (Array.isArray(nestedValue) || isRecord(nestedValue)) {
        findInterestingPayloadPaths(nestedValue, path, depth + 1, results);
      } else {
        results.push(path);
      }
    } else if (depth < 2) {
      findInterestingPayloadPaths(nestedValue, path, depth + 1, results);
    }

    if (results.length >= 40) break;
  }

  return results;
};

const buildPayloadDiagnostics = (
  payload: JsonRecord,
  sources: unknown[],
  identified: Record<string, unknown> = {},
) => {
  const cleanedIdentified = Object.fromEntries(
    Object.entries(identified).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  );

  return {
    identified: cleanedIdentified,
    interesting_paths: Array.from(new Set(findInterestingPayloadPaths(payload))).slice(0, 40),
    source_records: sources.length,
    top_level_keys: Object.keys(payload).slice(0, 20),
    wrapper_matches: COMMON_WRAPPER_PATHS.filter((path) => getByPath(payload, path) !== null),
  };
};

const summarizeDiagnostics = (diagnostics?: Record<string, unknown>) => {
  if (!diagnostics) return null;

  const identified = isRecord(diagnostics.identified) ? diagnostics.identified : {};
  const identifiedSummary = Object.entries(identified)
    .slice(0, 6)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(", ");

  const paths = Array.isArray(diagnostics.interesting_paths)
    ? diagnostics.interesting_paths
        .filter((value): value is string => typeof value === "string")
        .slice(0, 6)
    : [];

  return [
    identifiedSummary ? `Identificado: ${identifiedSummary}` : null,
    paths.length > 0 ? `Campos: ${paths.join(", ")}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ") || null;
};

const inferDomain = (eventType: string, payload: JsonRecord) => {
  const normalizedType = eventType.toLowerCase();

  if (
    normalizedType.includes("payment") ||
    normalizedType.includes("transaction") ||
    normalizedType.includes("earn") ||
    normalizedType.includes("payout") ||
    normalizedType.includes("statement") ||
    normalizedType.includes("fare") ||
    normalizedType.includes("trip.") ||
    normalizedType.includes("job.")
  ) {
    return "transaction" as const;
  }

  if (
    normalizedType.startsWith("vehicle.") ||
    normalizedType.includes("car.") ||
    normalizedType.includes("fleet") ||
    normalizedType.includes("supply")
  ) {
    return "vehicle" as const;
  }

  if (
    normalizedType.startsWith("driver.") ||
    normalizedType.includes("partner") ||
    normalizedType.includes("earner") ||
    normalizedType.includes("courier")
  ) {
    return "driver" as const;
  }

  const sources = getSearchSources(payload, []);
  if (prioritizeSources(sources, TRANSACTION_SHAPE_PATHS).some((source) => recordMatchesShape(source, TRANSACTION_SHAPE_PATHS))) {
    return "transaction" as const;
  }
  if (prioritizeSources(sources, VEHICLE_SHAPE_PATHS).some((source) => recordMatchesShape(source, VEHICLE_SHAPE_PATHS))) {
    return "vehicle" as const;
  }
  if (prioritizeSources(sources, DRIVER_SHAPE_PATHS).some((source) => recordMatchesShape(source, DRIVER_SHAPE_PATHS))) {
    return "driver" as const;
  }

  return "unknown" as const;
};

const processDriverEvent = async ({
  supabase,
  integracaoId,
  eventType,
  payload,
  lookups,
  syncedAt,
}: {
  supabase: ReturnType<typeof createClient>;
  integracaoId: string;
  eventType: string;
  payload: JsonRecord;
  lookups: Lookups;
  syncedAt: string;
}): Promise<ProcessResult> => {
  const sources = prioritizeSources(
    getSearchSources(payload, [
      "meta",
      "meta.driver",
      "meta.partner",
      "meta.earner",
      "driver",
      "data.driver",
      "data.resource.driver",
      "body.driver",
      "resource.driver",
      "entity.driver",
      "payload.driver",
      "partner",
      "data.partner",
      "resource.partner",
      "earner",
      "data.earner",
      "resource.earner",
      "driverProfile",
      "profile",
      "data.profile",
      "profile.driver",
      "user",
      "data.user",
      "account",
    ]),
    DRIVER_SHAPE_PATHS,
  );

  const uberDriverId =
    firstString(sources, [
      "driverId",
      "driver_id",
      "driverUUID",
      "driver_uuid",
      "partnerId",
      "partner_id",
      "earnerId",
      "earner_id",
      "userId",
      "user_id",
      "driver.id",
      "driver.uuid",
      "partner.id",
      "partner.uuid",
      "earner.id",
      "earner.uuid",
      "account.id",
      "user.id",
    ])
    ?? firstString(sources, ["uuid", "id", "externalId", "external_id"]);

  const email = firstString(sources, [
    "email",
    "contact.email",
    "contactInfo.email",
    "profile.email",
    "driver.email",
    "partner.email",
    "earner.email",
    "account.email",
    "user.email",
  ]);
  const rawPhone = firstPhone(sources, [
    "phoneNumber",
    "phone_number",
    "phone",
    "contact.phone",
    "contact.phoneNumber",
    "contactInfo.phone",
    "profile.phone",
    "driver.phone",
    "partner.phone",
    "earner.phone",
    "account.phone",
    "user.phone",
    "mobilePhone",
    "mobile_phone",
  ]);
  const normalizedPhone = normalizePhone(rawPhone);
  const motoristaId =
    (uberDriverId ? lookups.uberDriverToMotorista.get(uberDriverId) ?? null : null)
    ?? (email ? lookups.motoristasByEmail.get(email.toLowerCase()) ?? null : null)
    ?? (normalizedPhone ? lookups.motoristasByPhone.get(normalizedPhone) ?? null : null);
  const diagnostics = buildPayloadDiagnostics(payload, sources, {
    domain: "driver",
    email: email?.toLowerCase() ?? null,
    motorista_id: motoristaId,
    phone: normalizedPhone,
    uber_driver_id: uberDriverId,
  });

  if (!uberDriverId) {
    return {
      counts: emptyCounts(),
      diagnostics,
      domain: "driver",
      message: "Evento de motorista sem identificador utilizável.",
      status: "ignored",
    };
  }

  const firstName = firstString(sources, [
    "firstName",
    "first_name",
    "givenName",
    "given_name",
    "name.first",
    "name.givenName",
  ]);
  const lastName = firstString(sources, [
    "lastName",
    "last_name",
    "familyName",
    "family_name",
    "name.last",
    "name.familyName",
  ]);
  const fallbackFullName = [firstName, lastName].filter(Boolean).join(" ") || null;
  const fullName =
    firstString(sources, [
      "fullName",
      "full_name",
      "displayName",
      "name.full",
      "name",
      "driverName",
      "partnerName",
      "earnerName",
    ]) ?? fallbackFullName;

  const row = {
    integracao_id: integracaoId,
    uber_driver_id: uberDriverId,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    email: email?.toLowerCase() ?? null,
    phone: rawPhone ?? null,
    status: firstString(sources, ["status", "driverStatus", "driver_status", "state", "account.status"]),
    account_status: firstString(sources, ["accountStatus", "account_status", "account.state"]),
    onboarding_status: firstString(sources, ["onboardingStatus", "onboarding_status"]),
    city: firstString(sources, ["city", "address.city", "profile.city", "driver.city"]),
    rating: firstNumber(sources, ["rating", "metrics.rating", "driver.rating"]),
    consent_granted_at: firstIsoDate(sources, ["consentGrantedAt", "consent_granted_at", "consentedAt", "consented_at"]),
    flow_type: "webhook",
    raw_profile: payload,
    encrypted_fields: {
      event_type: eventType,
      driverIdEncrypted: firstString(sources, ["driverIdEncrypted", "driver_id_encrypted", "partnerIdEncrypted"]),
    },
    decrypted_fields: null,
    motorista_id: motoristaId,
    last_synced_at: syncedAt,
  };

  const counts = await upsertRows({
    supabase,
    table: "uber_drivers",
    integracaoId,
    idColumn: "uber_driver_id",
    onConflict: "integracao_id,uber_driver_id",
    rows: [row],
  });

  return {
    counts: { ...emptyCounts(), drivers: counts },
    diagnostics,
    domain: "driver",
    message: `Motorista Uber ${counts.inserted > 0 ? "criado" : "actualizado"}.`,
    status: "processed",
  };
};

const processVehicleEvent = async ({
  supabase,
  integracaoId,
  eventType,
  payload,
  lookups,
  syncedAt,
}: {
  supabase: ReturnType<typeof createClient>;
  integracaoId: string;
  eventType: string;
  payload: JsonRecord;
  lookups: Lookups;
  syncedAt: string;
}): Promise<ProcessResult> => {
  const sources = prioritizeSources(
    getSearchSources(payload, [
      "meta",
      "meta.vehicle",
      "meta.car",
      "vehicle",
      "data.vehicle",
      "data.resource.vehicle",
      "body.vehicle",
      "resource.vehicle",
      "entity.vehicle",
      "payload.vehicle",
      "car",
      "data.car",
      "resource.car",
      "fleet.vehicle",
      "fleetVehicle",
      "trip.vehicle",
      "data.trip.vehicle",
      "supply.vehicle",
      "supplyVehicle",
      "supply",
    ]),
    VEHICLE_SHAPE_PATHS,
  );

  const uberVehicleId =
    firstString(sources, [
      "vehicleId",
      "vehicle_id",
      "vehicleUUID",
      "vehicle_uuid",
      "carId",
      "car_id",
      "fleetVehicleId",
      "fleet_vehicle_id",
      "vehicle.id",
      "vehicle.uuid",
      "car.id",
      "car.uuid",
      "supply.vehicle.id",
    ])
    ?? firstString(sources, ["uuid", "id", "externalId", "external_id"]);
  const licensePlate = firstString(sources, [
    "licensePlate",
    "license_plate",
    "vehicle.licensePlate",
    "vehicle.license_plate",
    "plate",
    "registrationNumber",
    "registration_number",
    "vehiclePlate",
    "vehicle_plate",
    "numberPlate",
    "number_plate",
  ]);
  const normalizedLicensePlate = normalizePlate(licensePlate);
  const viaturaId = normalizedLicensePlate ? lookups.viaturasByPlate.get(normalizedLicensePlate) ?? null : null;
  const diagnostics = buildPayloadDiagnostics(payload, sources, {
    domain: "vehicle",
    license_plate: normalizedLicensePlate,
    uber_vehicle_id: uberVehicleId,
    viatura_id: viaturaId,
  });

  if (!uberVehicleId) {
    return {
      counts: emptyCounts(),
      diagnostics,
      domain: "vehicle",
      message: "Evento de viatura sem identificador utilizável.",
      status: "ignored",
    };
  }

  const row: Record<string, unknown> = {
    integracao_id: integracaoId,
    uber_vehicle_id: uberVehicleId,
    owner_id: firstString(sources, [
      "ownerId",
      "owner_id",
      "driverId",
      "driver_id",
      "partnerId",
      "partner_id",
      "owner.id",
    ]),
    license_plate: licensePlate,
    make: firstString(sources, ["make", "brand", "manufacturer"]),
    model: firstString(sources, ["model", "vehicleModel"]),
    color: firstString(sources, ["color", "vehicleColor"]),
    year: firstNumber(sources, ["year", "modelYear"]),
    status: firstString(sources, ["status", "state", "vehicleStatus", "vehicle_status"]),
    supply_status: firstString(sources, ["supplyStatus", "supply_status", "supply.state"]),
    fleet_status: firstString(sources, ["fleetStatus", "fleet_status"]) ?? eventType,
    raw_vehicle: payload,
    encrypted_fields: {
      event_type: eventType,
      vehicleIdEncrypted: firstString(sources, ["vehicleIdEncrypted", "vehicle_id_encrypted", "carIdEncrypted"]),
      vin: firstString(sources, ["vin", "vehicleVin"]),
    },
    decrypted_fields: null,
    viatura_id: viaturaId,
    last_synced_at: syncedAt,
  };

  const counts = await upsertRows({
    supabase,
    table: "uber_vehicles",
    integracaoId,
    idColumn: "uber_vehicle_id",
    onConflict: "integracao_id,uber_vehicle_id",
    rows: [row],
  });

  return {
    counts: { ...emptyCounts(), vehicles: counts },
    diagnostics,
    domain: "vehicle",
    message: `Viatura Uber ${counts.inserted > 0 ? "criada" : "actualizada"}.`,
    status: "processed",
  };
};

const processTransactionEvent = async ({
  supabase,
  integracaoId,
  eventId,
  eventType,
  payload,
  lookups,
  syncedAt,
}: {
  supabase: ReturnType<typeof createClient>;
  integracaoId: string;
  eventId: string | null;
  eventType: string;
  payload: JsonRecord;
  lookups: Lookups;
  syncedAt: string;
}): Promise<ProcessResult> => {
  const sources = prioritizeSources(
    getSearchSources(payload, [
      "meta",
      "meta.payment",
      "meta.transaction",
      "meta.earning",
      "meta.payout",
      "meta.trip",
      "transaction",
      "data.transaction",
      "body.transaction",
      "resource.transaction",
      "entity.transaction",
      "payment",
      "data.payment",
      "data.resource.payment",
      "body.payment",
      "resource.payment",
      "earning",
      "data.earning",
      "body.earning",
      "resource.earning",
      "payout",
      "data.payout",
      "resource.payout",
      "statement",
      "data.statement",
      "trip",
      "data.trip",
      "trip.payment",
      "trip.fare",
    ]),
    TRANSACTION_SHAPE_PATHS,
  );

  const tripReference = firstString(sources, [
    "tripReference",
    "trip_reference",
    "tripId",
    "trip_id",
    "jobId",
    "job_id",
    "orderReference",
    "order_reference",
    "workflowId",
    "workflow_id",
    "trip.id",
    "trip.uuid",
  ]);
  const occurredAt = firstIsoDate(sources, [
    "occurredAt",
    "occurred_at",
    "createdAt",
    "created_at",
    "eventTime",
    "event_time",
    "timestamp",
    "tripDate",
    "trip_date",
    "paymentDate",
    "payment_date",
    "trip.createdAt",
    "trip.created_at",
    "settledAt",
    "settled_at",
  ]);
  const settledAt = firstIsoDate(sources, [
    "settledAt",
    "settled_at",
    "paidAt",
    "paid_at",
    "updatedAt",
    "updated_at",
    "payment.updatedAt",
    "payment.updated_at",
  ]);
  const uberDriverId = firstString(sources, [
    "driverId",
    "driver_id",
    "earnerId",
    "earner_id",
    "partnerId",
    "partner_id",
    "driver.id",
    "driver.uuid",
    "earner.id",
    "earner.uuid",
    "partner.id",
    "partner.uuid",
  ]);
  const uberVehicleId = firstString(sources, [
    "vehicleId",
    "vehicle_id",
    "carId",
    "car_id",
    "vehicle.id",
    "vehicle.uuid",
    "car.id",
    "car.uuid",
    "trip.vehicleId",
    "trip.vehicle_id",
  ]);
  const email = firstString(sources, [
    "email",
    "driver.email",
    "partner.email",
    "contact.email",
    "user.email",
    "account.email",
  ]);
  const rawPhone = firstPhone(sources, [
    "phone",
    "phoneNumber",
    "driver.phone",
    "partner.phone",
    "contact.phone",
    "user.phone",
    "account.phone",
  ]);
  const normalizedPhone = normalizePhone(rawPhone);
  const normalizedLicensePlate = normalizePlate(firstString(sources, [
    "licensePlate",
    "license_plate",
    "plate",
    "registrationNumber",
    "vehicle.licensePlate",
    "trip.vehicle.licensePlate",
  ]));
  const fallbackTransactionId = eventId
    ?? (([eventType, tripReference, occurredAt ?? syncedAt]
      .filter((value): value is string => Boolean(value))
      .join(":")) || null);
  const uberTransactionId =
    firstString(sources, [
      "transactionId",
      "transaction_id",
      "paymentId",
      "payment_id",
      "earningId",
      "earning_id",
      "payoutId",
      "payout_id",
      "statementId",
      "statement_id",
      "payment.id",
      "transaction.id",
      "payout.id",
      "statement.id",
    ])
    ?? firstString(sources, ["uuid", "id"])
    ?? fallbackTransactionId;
  const motoristaId =
    (uberDriverId ? lookups.uberDriverToMotorista.get(uberDriverId) ?? null : null)
    ?? (email ? lookups.motoristasByEmail.get(email.toLowerCase()) ?? null : null)
    ?? (normalizedPhone ? lookups.motoristasByPhone.get(normalizedPhone) ?? null : null);
  const viaturaId =
    (uberVehicleId ? lookups.uberVehicleToViatura.get(uberVehicleId) ?? null : null)
    ?? (normalizedLicensePlate ? lookups.viaturasByPlate.get(normalizedLicensePlate) ?? null : null);
  const diagnostics = buildPayloadDiagnostics(payload, sources, {
    domain: "transaction",
    motorista_id: motoristaId,
    trip_reference: tripReference,
    uber_driver_id: uberDriverId,
    uber_transaction_id: uberTransactionId,
    uber_vehicle_id: uberVehicleId,
    viatura_id: viaturaId,
  });

  if (!uberTransactionId) {
    return {
      counts: emptyCounts(),
      diagnostics,
      domain: "transaction",
      message: "Evento financeiro sem identificador utilizável.",
      status: "ignored",
    };
  }

  const row = {
    integracao_id: integracaoId,
    uber_transaction_id: uberTransactionId,
    trip_reference: tripReference,
    motorista_id: motoristaId,
    viatura_id: viaturaId,
    uber_driver_id: uberDriverId,
    uber_vehicle_id: uberVehicleId,
    transaction_type: eventType,
    status: firstString(sources, ["status", "state", "paymentStatus", "payment_status"]),
    currency: firstString(sources, [
      "currency",
      "currencyCode",
      "currency_code",
      "amount.currency",
      "amount.currencyCode",
      "grossAmount.currencyCode",
      "money.currencyCode",
    ]),
    gross_amount: firstAmount(sources, [
      "grossAmount",
      "gross_amount",
      "amount",
      "totalAmount",
      "total_amount",
      "fare",
      "gross",
      "paymentAmount",
    ]),
    net_amount: firstAmount(sources, [
      "netAmount",
      "net_amount",
      "net",
      "driverAmount",
      "driver_amount",
      "earnings",
      "payout",
      "partnerAmount",
      "partner_amount",
    ]),
    commission_amount: firstAmount(sources, [
      "commissionAmount",
      "commission_amount",
      "fee",
      "fees",
      "serviceFee",
      "service_fee",
      "uberFee",
      "uber_fee",
    ]),
    occurred_at: occurredAt ?? syncedAt,
    settled_at: settledAt,
    raw_transaction: payload,
  };

  const counts = await upsertRows({
    supabase,
    table: "uber_transactions",
    integracaoId,
    idColumn: "uber_transaction_id",
    onConflict: "integracao_id,uber_transaction_id",
    rows: [row],
  });

  return {
    counts: { ...emptyCounts(), transactions: counts },
    diagnostics,
    domain: "transaction",
    message: `Evento financeiro Uber ${counts.inserted > 0 ? "criado" : "actualizado"}.`,
    status: "processed",
  };
};

const logWebhookResult = async ({
  supabase,
  integracaoId,
  eventId,
  eventType,
  result,
  executadoPor,
  replay,
}: {
  supabase: ReturnType<typeof createClient>;
  integracaoId: string;
  eventId: string | null;
  eventType: string;
  result: ProcessResult;
  executadoPor: string | null;
  replay: boolean;
}) => {
  const logStatus = result.status === "processed" ? "success" : result.status === "ignored" ? "partial" : "error";
  await supabase.from("uber_sync_logs").insert({
    integracao_id: integracaoId,
    executado_por: executadoPor,
    tipo: replay ? "webhook_replay" : "webhook",
    status: logStatus,
    mensagem: result.message,
    erros: result.status === "failed" ? 1 : 0,
    viagens_novas: result.counts.transactions.inserted,
    viagens_atualizadas: result.counts.transactions.updated,
    detalhes: {
      counts: result.counts,
      diagnostics: result.diagnostics ?? null,
      domain: result.domain,
      event_id: eventId,
      event_type: eventType,
      replay,
    },
  });
};

const processStoredEvent = async ({
  supabase,
  event,
  lookups,
  executadoPor,
  replay,
}: {
  supabase: ReturnType<typeof createClient>;
  event: StoredWebhookEvent;
  lookups: Lookups;
  executadoPor: string | null;
  replay: boolean;
}) => {
  const syncedAt = new Date().toISOString();
  let result: ProcessResult;

  try {
    const domain = inferDomain(event.event_type, event.payload);
    if (domain === "driver") {
      result = await processDriverEvent({
        supabase,
        integracaoId: event.integracao_id,
        eventType: event.event_type,
        payload: event.payload,
        lookups,
        syncedAt,
      });
    } else if (domain === "vehicle") {
      result = await processVehicleEvent({
        supabase,
        integracaoId: event.integracao_id,
        eventType: event.event_type,
        payload: event.payload,
        lookups,
        syncedAt,
      });
    } else if (domain === "transaction") {
      result = await processTransactionEvent({
        supabase,
        integracaoId: event.integracao_id,
        eventId: event.event_id,
        eventType: event.event_type,
        payload: event.payload,
        lookups,
        syncedAt,
      });
    } else {
      const sources = getSearchSources(event.payload, []);
      result = {
        counts: emptyCounts(),
        diagnostics: buildPayloadDiagnostics(event.payload, sources, { domain: "unknown" }),
        domain: "unknown",
        message: `Evento ${event.event_type} guardado, mas ainda sem parser dedicado.`,
        status: "ignored",
      };
    }
  } catch (error) {
    result = {
      counts: emptyCounts(),
      diagnostics: buildPayloadDiagnostics(event.payload, getSearchSources(event.payload, []), {
        domain: inferDomain(event.event_type, event.payload),
      }),
      domain: inferDomain(event.event_type, event.payload),
      message: error instanceof Error ? error.message : "Falha ao processar o webhook.",
      status: "failed",
    };
  }

  const diagnosticsSummary = summarizeDiagnostics(result.diagnostics);
  console.info(
    `[uber-webhook] ${replay ? "replay" : "receive"} ${event.event_type} -> ${result.status}${diagnosticsSummary ? ` | ${diagnosticsSummary}` : ""}`,
  );

  await supabase
    .from("uber_webhook_events")
    .update({
      processing_status: result.status,
      error_message: result.status === "processed"
        ? null
        : [result.message, diagnosticsSummary].filter((value): value is string => Boolean(value)).join(" · "),
      processed_at: new Date().toISOString(),
    })
    .eq("id", event.id);

  await supabase
    .from("plataformas_configuracao")
    .update({ last_webhook_at: new Date().toISOString() })
    .eq("id", event.integracao_id);

  await logWebhookResult({
    supabase,
    integracaoId: event.integracao_id,
    eventId: event.event_id,
    eventType: event.event_type,
    result,
    executadoPor,
    replay,
  });

  return result;
};

// ─── CSV Import Logic ───

const CSV_COLUMN_ALIASES: Record<string, string[]> = {
  uber_transaction_id: ["trip id", "reference", "referência", "referencia", "transaction id", "payment id", "id"],
  trip_reference: ["trip id", "trip reference", "trip ref", "referência viagem", "referencia viagem"],
  uber_driver_id: ["driver", "driver id", "motorista", "driver name", "nome motorista", "driver uuid", "uuid do motorista", "uuid_do_motorista"],
  driver_first_name: ["nome próprio do motorista", "nome proprio do motorista", "first name", "nome próprio", "nome proprio", "nome_proprio_do_motorista"],
  driver_last_name: ["apelido do motorista", "last name", "apelido", "apelido_do_motorista"],
  uber_vehicle_id: ["vehicle", "vehicle id", "viatura", "plate", "license plate", "matrícula", "matricula", "veículo", "veiculo"],
  occurred_at: ["date", "data", "occurred at", "trip date", "data viagem", "datetime", "data/hora", "timestamp"],
  gross_amount: ["gross", "bruto", "total", "gross amount", "valor bruto", "valor total", "fare", "tarifa", "valor", "pago a si"],
  net_amount: ["net", "líquido", "liquido", "net amount", "valor líquido", "valor liquido", "earnings", "ganhos", "driver earnings", "pago a si:os seus rendimentos", "pago a si : os seus rendimentos"],
  commission_amount: ["commission", "comissão", "comissao", "fee", "taxa", "commission amount", "uber fee", "service fee", "pago a si:os seus rendimentos:taxa de serviço", "pago a si : os seus rendimentos : taxa de serviço", "pago a si:os seus rendimentos:taxa de servico", "pago a si : os seus rendimentos : taxa de servico"],
  currency: ["currency", "moeda", "currency code"],
  status: ["status", "estado", "state", "trip status"],
  transaction_type: ["type", "tipo", "transaction type", "trip type"],
};

const detectCsvSeparator = (firstLine: string): string => {
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  if (tabCount > commaCount && tabCount > semiCount) return "\t";
  if (semiCount > commaCount) return ";";
  return ",";
};

const parseCsvLine = (line: string, separator: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

const mapCsvHeaders = (headers: string[]): Map<number, string> => {
  const mapping = new Map<number, string>();
  // Normalize: lowercase, remove BOM, trim, remove quotes, collapse spaces around colons
  const normalizedHeaders = headers.map((h) =>
    h.toLowerCase().replace(/^\ufeff/, "").trim().replace(/['"]/g, "").replace(/\s*:\s*/g, ":")
  );

  for (let i = 0; i < normalizedHeaders.length; i++) {
    const header = normalizedHeaders[i];
    for (const [field, aliases] of Object.entries(CSV_COLUMN_ALIASES)) {
      // Also normalize aliases for comparison
      const normalizedAliases = aliases.map((a) => a.replace(/\s*:\s*/g, ":"));
      if (normalizedAliases.includes(header) && !Array.from(mapping.values()).includes(field)) {
        mapping.set(i, field);
        break;
      }
    }
  }
  return mapping;
};

const parseAmountValue = (value: string): number | null => {
  if (!value) return null;
  // Handle European format (1.234,56) and standard (1,234.56)
  let cleaned = value.replace(/[€$£\s]/g, "").trim();
  if (!cleaned) return null;

  // If has both . and , check which is last (that's the decimal separator)
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot) {
    // European: 1.234,56
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Standard: 1,234.56
    cleaned = cleaned.replace(/,/g, "");
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const processCsvImport = async ({
  supabase,
  integracaoId,
  csvText,
  origem,
  nomeOriginal,
  dataExtracao,
  periodoInicio,
  periodoFim,
}: {
  supabase: ReturnType<typeof createClient>;
  integracaoId: string;
  csvText: string;
  origem: string;
  nomeOriginal: string;
  dataExtracao: string;
  periodoInicio?: string | null;
  periodoFim?: string | null;
}) => {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { success: false, error: "CSV sem dados (apenas cabeçalho ou vazio)", total_rows: 0, inserted: 0, updated: 0, errors: 0 };
  }

  const separator = detectCsvSeparator(lines[0]);
  const headerCells = parseCsvLine(lines[0], separator);
  const columnMap = mapCsvHeaders(headerCells);

  if (columnMap.size === 0) {
    return {
      success: false,
      error: `Não foi possível mapear nenhuma coluna do CSV. Colunas encontradas: ${headerCells.join(", ")}`,
      total_rows: 0, inserted: 0, updated: 0, errors: 0,
    };
  }

  console.info(`[uber-webhook] CSV import: ${lines.length - 1} rows, separator="${separator === "\t" ? "TAB" : separator}", mapped columns: ${Array.from(columnMap.entries()).map(([i, f]) => `${headerCells[i]}->${f}`).join(", ")}`);

  // Log the import event in uber_webhook_events
  await supabase.from("uber_webhook_events").insert({
    integracao_id: integracaoId,
    event_id: `csv-import-${Date.now()}`,
    event_type: "csv_import",
    signature: null,
    payload: { origem, nome_original: nomeOriginal, data_extracao: dataExtracao, total_rows: lines.length - 1, columns_mapped: Array.from(columnMap.values()) },
    headers: { "x-import-source": origem },
    processing_status: "received",
    error_message: null,
    processed_at: null,
  });

  // Load lookups for motorista/viatura matching
  const lookups = await loadLookups(supabase, integracaoId);
  const syncedAt = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  let parseErrors = 0;
  let skippedRows = 0;
  const skippedReasons: string[] = [];
  const driverRowsMap = new Map<string, Record<string, unknown>>();

  // UUID v4 regex for validating driver IDs
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const EXTREME_AMOUNT_THRESHOLD = -10000;

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], separator);
    const csvRow: Record<string, string> = {};

    // Build raw row data
    for (let j = 0; j < cells.length && j < headerCells.length; j++) {
      csvRow[headerCells[j]] = cells[j];
    }

    // Map to fields
    const mapped: Record<string, string> = {};
    for (const [colIndex, fieldName] of columnMap.entries()) {
      if (colIndex < cells.length && cells[colIndex]) {
        mapped[fieldName] = cells[colIndex];
      }
    }

    // Extract period from filename (e.g. "20260309-20260316-payments_driver-...")
    let filenamePeriod = "";
    let filenameDate: string | null = null;
    const filenameMatch = nomeOriginal?.match(/(\d{8})-(\d{8})/);
    if (filenameMatch) {
      filenamePeriod = `${filenameMatch[1]}-${filenameMatch[2]}`;
      // Use start date as occurred_at fallback so transactions fall in the correct week view
      const startDateStr = filenameMatch[1];
      const parsedStart = new Date(`${startDateStr.slice(0, 4)}-${startDateStr.slice(4, 6)}-${startDateStr.slice(6, 8)}T12:00:00Z`);
      if (!Number.isNaN(parsedStart.getTime())) {
        filenameDate = parsedStart.toISOString();
      }
    }

    // Período da importação: o enviado pelo wizard (manual) tem prioridade
    // sobre o extraído do nome do ficheiro. Garante ID estável e data correta.
    const bodyPeriod = (periodoInicio && periodoFim)
      ? `${periodoInicio.replace(/-/g, "")}-${periodoFim.replace(/-/g, "")}`
      : "";
    const periodo = bodyPeriod || filenamePeriod;
    let periodStartIso = filenameDate;
    if (periodoInicio) {
      const d = new Date(`${periodoInicio}T12:00:00Z`);
      if (!Number.isNaN(d.getTime())) periodStartIso = d.toISOString();
    }

    // ID de transação DETERMINÍSTICO (sem Date.now): reimportar a mesma
    // semana substitui em vez de duplicar.
    const driverUuid = mapped.uber_driver_id || "";
    const transactionId = mapped.uber_transaction_id
      || (periodo ? `${driverUuid || `row${i}`}-${periodo}` : `${integracaoId}-row${i}`);

    // Data: coluna do CSV se existir, senão o INÍCIO do período (meio-dia UTC).
    // Nunca a hora do upload — isso carimbava a semana errada.
    let occurredAt: string | null = null;
    if (mapped.occurred_at) {
      const parsed = new Date(mapped.occurred_at);
      occurredAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    if (!occurredAt && periodStartIso) {
      occurredAt = periodStartIso;
    }

    // Resolve motorista/viatura
    const uberDriverId = mapped.uber_driver_id || null;
    const uberVehicleId = mapped.uber_vehicle_id || null;
    const normalizedPlate = normalizePlate(uberVehicleId);

    const driverFullName = mapped.driver_first_name && mapped.driver_last_name
      ? `${mapped.driver_first_name} ${mapped.driver_last_name}`.trim()
      : (mapped.driver_first_name || null);

    const motoristaId =
      (uberDriverId ? lookups.uberDriverToMotorista.get(uberDriverId) ?? null : null)
      ?? (driverFullName ? lookups.motoristasByName.get(normalizeName(driverFullName)) ?? null : null);

    const viaturaId =
      (uberVehicleId ? lookups.uberVehicleToViatura.get(uberVehicleId) ?? null : null)
      ?? (normalizedPlate ? lookups.viaturasByPlate.get(normalizedPlate) ?? null : null);

    // === Validation: skip summary/totals rows ===
    const grossAmount = parseAmountValue(mapped.gross_amount || "");
    const netAmount = parseAmountValue(mapped.net_amount || "");

    // Skip rows with extremely negative amounts (likely totals/summary rows)
    if (grossAmount !== null && grossAmount < EXTREME_AMOUNT_THRESHOLD) {
      skippedRows++;
      skippedReasons.push(`Row ${i}: gross_amount=${grossAmount} (below threshold ${EXTREME_AMOUNT_THRESHOLD})`);
      console.warn(`[uber-webhook] CSV row ${i} skipped: gross_amount=${grossAmount} is below ${EXTREME_AMOUNT_THRESHOLD} — likely a totals/summary row`);
      continue;
    }
    if (netAmount !== null && netAmount < EXTREME_AMOUNT_THRESHOLD) {
      skippedRows++;
      skippedReasons.push(`Row ${i}: net_amount=${netAmount} (below threshold ${EXTREME_AMOUNT_THRESHOLD})`);
      console.warn(`[uber-webhook] CSV row ${i} skipped: net_amount=${netAmount} is below ${EXTREME_AMOUNT_THRESHOLD} — likely a totals/summary row`);
      continue;
    }

    // Skip rows without a valid driver UUID (likely header repeats or totals)
    if (uberDriverId && !UUID_REGEX.test(uberDriverId)) {
      skippedRows++;
      skippedReasons.push(`Row ${i}: uber_driver_id="${uberDriverId}" is not a valid UUID`);
      console.warn(`[uber-webhook] CSV row ${i} skipped: uber_driver_id="${uberDriverId}" is not a valid UUID`);
      continue;
    }

    if (uberDriverId && UUID_REGEX.test(uberDriverId)) {
      if (!driverRowsMap.has(uberDriverId)) {
        const firstName = mapped.driver_first_name || "Motorista";
        const lastName = mapped.driver_last_name || `(CSV ${nomeOriginal ? nomeOriginal.slice(0, 15) : "Import"})`;
        driverRowsMap.set(uberDriverId, {
          integracao_id: integracaoId,
          uber_driver_id: uberDriverId,
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`.trim(),
          email: null,
          phone: null,
          status: "active",
          motorista_id: motoristaId ?? undefined,
        });
      } else if (motoristaId && !driverRowsMap.get(uberDriverId)!.motorista_id) {
        // Enrich existing entry with resolved motorista_id
        driverRowsMap.get(uberDriverId)!.motorista_id = motoristaId;
      }
    }

    rows.push({
      integracao_id: integracaoId,
      uber_transaction_id: transactionId,
      trip_reference: mapped.trip_reference || mapped.uber_transaction_id || null,
      motorista_id: motoristaId,
      viatura_id: viaturaId,
      uber_driver_id: uberDriverId,
      uber_vehicle_id: uberVehicleId,
      transaction_type: mapped.transaction_type || "csv_import",
      status: mapped.status || "imported",
      currency: mapped.currency || "EUR",
      gross_amount: grossAmount,
      net_amount: netAmount,
      commission_amount: parseAmountValue(mapped.commission_amount || ""),
      occurred_at: occurredAt || syncedAt,
      raw_transaction: { csv_row: csvRow, import_source: origem, nome_original: nomeOriginal },
    });
  }

  // Upsert in batches
  let totalInserted = 0;
  let totalUpdated = 0;

  try {
    const counts = await upsertRows({
      supabase,
      table: "uber_transactions",
      integracaoId,
      idColumn: "uber_transaction_id",
      onConflict: "integracao_id,uber_transaction_id",
      rows,
    });
    totalInserted = counts.inserted;
    totalUpdated = counts.updated;
  } catch (error) {
    console.error("[uber-webhook] CSV upsert error:", error);
    parseErrors = rows.length;
  }

  // Upsert drivers that were found in the CSV
  let newDrivers = 0;
  if (driverRowsMap.size > 0) {
    try {
      const driverCounts = await upsertRows({
        supabase,
        table: "uber_drivers",
        integracaoId,
        idColumn: "uber_driver_id",
        onConflict: "integracao_id,uber_driver_id",
        rows: Array.from(driverRowsMap.values()),
      });
      newDrivers = driverCounts.inserted;
      console.info(`[uber-webhook] CSV added ${newDrivers} new drivers`);
    } catch (driverErr) {
      console.warn("[uber-webhook] CSV upsert drivers error:", driverErr);
    }
  }

  // Log to uber_sync_logs
  await supabase.from("uber_sync_logs").insert({
    integracao_id: integracaoId,
    executado_por: null,
    tipo: "csv_import",
    status: parseErrors > 0 ? "error" : "success",
    mensagem: `Importação CSV: ${totalInserted} novos, ${totalUpdated} actualizados de ${rows.length} linhas${skippedRows > 0 ? `, ${skippedRows} ignoradas` : ""} (${nomeOriginal})`,
    erros: parseErrors,
    viagens_novas: totalInserted,
    viagens_atualizadas: totalUpdated,
    detalhes: {
      origem,
      nome_original: nomeOriginal,
      data_extracao: dataExtracao,
      total_rows: rows.length,
      skipped_rows: skippedRows,
      skipped_reasons: skippedReasons.slice(0, 20),
      columns_mapped: Array.from(columnMap.values()),
      separator,
      motoristas_novos: newDrivers,
    },
  });

  // Update last_webhook_at
  await supabase
    .from("plataformas_configuracao")
    .update({ last_webhook_at: new Date().toISOString() })
    .eq("id", integracaoId);

  console.info(`[uber-webhook] CSV import done: ${totalInserted} inserted, ${totalUpdated} updated, ${parseErrors} errors, ${skippedRows} skipped`);

  return {
    success: parseErrors === 0,
    total_rows: rows.length,
    inserted: totalInserted,
    updated: totalUpdated,
    errors: parseErrors,
    skipped: skippedRows,
    columns_mapped: Array.from(columnMap.values()),
  };
};

// Eventos push do Uber (sincronização automática) DESATIVADOS.
// O import manual por CSV (ramo `dados_csv_brutos`) continua funcional.
// Reativar: pôr a false e re-registar o webhook na consola do Uber.
const UBER_PUSH_DESATIVADO = true;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Método não suportado" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "Configuração Supabase em falta" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const requestUrl = new URL(req.url);
  const signature = req.headers.get("x-uber-signature");
  const rawBody = await req.text();
  const headers = headersToObject(req.headers);

  if (!rawBody.trim()) {
    return jsonResponse({ success: false, error: "Payload vazio" }, 400);
  }

  let parsedBody: JsonRecord;
  try {
    const parsedJson = JSON.parse(rawBody);
    parsedBody = isRecord(parsedJson) ? parsedJson : { data: parsedJson as JsonValue };
  } catch (error) {
    const integracaoId = requestUrl.searchParams.get("integracao_id");
    if (integracaoId) {
      await supabase.from("uber_webhook_events").insert({
        integracao_id: integracaoId,
        event_type: "invalid_json",
        signature,
        payload: rawBody,
        headers,
        processing_status: "rejected",
        error_message: error instanceof Error ? error.message : "JSON inválido",
        processed_at: new Date().toISOString(),
      });
    }

    return jsonResponse({ success: false, error: "Payload JSON inválido" }, 400);
  }

  const replayPending = parsedBody.replay_pending === true;
  const replayEventId = asTrimmedString(parsedBody.replay_event_id);
  const isReplay = replayPending || Boolean(replayEventId);

  if (isReplay) {
    if (!anonKey) {
      return jsonResponse({ success: false, error: "SUPABASE_ANON_KEY em falta para replay." }, 500);
    }

    try {
      const executadoPor = await requireUserId(req, supabaseUrl, anonKey);
      const integracaoId = asTrimmedString(parsedBody.integracao_id) ?? requestUrl.searchParams.get("integracao_id");
      if (!integracaoId) {
        return jsonResponse({ success: false, error: "integracao_id é obrigatório para replay" }, 400);
      }

      const replayLimit = Math.max(1, Math.min(asNumber(parsedBody.limit) ?? 20, 100));
      let query = supabase
        .from("uber_webhook_events")
        .select("id, integracao_id, event_id, event_type, payload")
        .eq("integracao_id", integracaoId);

      if (replayEventId) {
        query = query.eq("id", replayEventId);
      } else {
        query = query
          .in("processing_status", ["received", "failed", "ignored"])
          .order("created_at", { ascending: false })
          .limit(replayLimit);
      }

      const { data: replayEvents, error: replayError } = await query;
      if (replayError) {
        return jsonResponse({ success: false, error: "Não foi possível carregar eventos para replay" }, 500);
      }

      if (!replayEvents || replayEvents.length === 0) {
        return jsonResponse({ success: true, message: "Nenhum evento pendente para reprocessar.", replayed: 0 });
      }

      const lookups = await loadLookups(supabase, integracaoId);
      const results = [] as ProcessResult[];
      for (const event of replayEvents as StoredWebhookEvent[]) {
        results.push(await processStoredEvent({
          supabase,
          event,
          lookups,
          executadoPor,
          replay: true,
        }));
      }

      return jsonResponse({
        success: true,
        message: `${results.length} evento(s) reprocessado(s).`,
        replayed: results.length,
        processed: results.filter((result) => result.status === "processed").length,
        ignored: results.filter((result) => result.status === "ignored").length,
        failed: results.filter((result) => result.status === "failed").length,
      });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: error instanceof Error ? error.message : "Não foi possível reprocessar eventos.",
      }, 401);
    }
  }

  // ─── Proxy: Apify dual-report format → uber-import-reports ───
  // Accept both new keys (pagamentos_csv/viagens_csv) and legacy keys (dados_csv_pagamentos/dados_csv_atividades)
  const hasNewKeys = typeof parsedBody.pagamentos_csv === "string" || typeof parsedBody.viagens_csv === "string";
  const hasLegacyKeys = typeof parsedBody.dados_csv_pagamentos === "string" || typeof parsedBody.dados_csv_atividades === "string";

  if (hasNewKeys || hasLegacyKeys) {
    const formatDetected = hasNewKeys ? "apify_dual_report_new_keys" : "apify_dual_report_legacy_keys";
    console.info(`[uber-webhook] Proxy detected format: ${formatDetected}`);

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (bearerToken !== serviceRoleKey) {
      return jsonResponse({ success: false, error: "Autenticação inválida. Use SERVICE_ROLE_KEY." }, 401);
    }

    // Normalize legacy keys to canonical keys before proxying
    const normalizedBody = { ...parsedBody };
    if (hasLegacyKeys && !hasNewKeys) {
      if (typeof parsedBody.dados_csv_pagamentos === "string") {
        normalizedBody.pagamentos_csv = parsedBody.dados_csv_pagamentos;
      }
      if (typeof parsedBody.dados_csv_atividades === "string") {
        normalizedBody.viagens_csv = parsedBody.dados_csv_atividades;
      }
    }

    // Auto-resolve integracao_id if not provided
    if (!normalizedBody.integracao_id) {
      const { data: uberConfigs } = await supabase
        .from("plataformas_configuracao")
        .select("id")
        .eq("plataforma", "uber")
        .limit(2);

      if (uberConfigs?.length === 1) {
        normalizedBody.integracao_id = uberConfigs[0].id;
        console.info(`[uber-webhook] Auto-resolved integracao_id for proxy: ${uberConfigs[0].id}`);
      }
    }

    const proxyUrl = `${supabaseUrl}/functions/v1/uber-import-reports`;
    try {
      const proxyResp = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(normalizedBody),
      });
      const proxyBody = await proxyResp.text();
      return new Response(proxyBody, {
        status: proxyResp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[uber-webhook] Proxy to uber-import-reports failed:", err);
      return jsonResponse({ success: false, error: "Falha ao redirecionar para uber-import-reports" }, 502);
    }
  }

  // ─── CSV Import from Apify Bot or Admin Upload ───
  const csvBruto = parsedBody.dados_csv_brutos;
  if (typeof csvBruto === "string" && csvBruto.length > 0) {
    // Validate auth: accept SERVICE_ROLE_KEY or authenticated user (a
    // permissão de admin é validada POR-ORG mais abaixo, contra a org dona
    // da integração — o flag global profiles.is_admin dava 403/401 errado a
    // utilizadores multi-org).
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const isRobotCall = bearerToken === serviceRoleKey;
    let csvCallerUserId: string | null = null;

    if (!isRobotCall && bearerToken) {
      try {
        const authClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: userData } = await authClient.auth.getUser();
        if (userData?.user?.id) csvCallerUserId = userData.user.id;
      } catch {
        // Auth validation failed — csvCallerUserId stays null
      }
    }

    if (!isRobotCall && !csvCallerUserId) {
      return jsonResponse({ success: false, error: "Autenticação inválida para importação CSV" }, 401);
    }

    const csvIntegracaoId = requestUrl.searchParams.get("integracao_id") ?? asTrimmedString(parsedBody.integracao_id);
    if (!csvIntegracaoId) {
      return jsonResponse({ success: false, error: "integracao_id é obrigatório para importação CSV" }, 400);
    }

    // Utilizador autenticado: tem de ser admin da org dona da integração.
    if (csvCallerUserId) {
      const { data: csvIntCfg } = await supabase
        .from("plataformas_configuracao")
        .select("org_id")
        .eq("id", csvIntegracaoId)
        .single();
      if (!csvIntCfg) {
        return jsonResponse({ success: false, error: "Integração Uber não encontrada" }, 404);
      }
      const { data: csvMembership } = await supabase
        .from("user_organizacoes")
        .select("is_admin")
        .eq("user_id", csvCallerUserId)
        .eq("org_id", csvIntCfg.org_id)
        .maybeSingle();
      if (!csvMembership?.is_admin) {
        return jsonResponse(
          { success: false, error: "Sem permissão de administrador nesta organização" },
          403,
        );
      }
    }

    // Verify integration exists
    const { data: csvConfigRows, error: csvConfigError } = await supabase.rpc("get_uber_platform_config", {
      p_integracao_id: csvIntegracaoId,
    });
    if (csvConfigError || !csvConfigRows?.[0]) {
      return jsonResponse({ success: false, error: "Integração Uber não encontrada" }, 404);
    }

    try {
      const csvResult = await processCsvImport({
        supabase,
        integracaoId: csvIntegracaoId,
        csvText: csvBruto,
        origem: asTrimmedString(parsedBody.origem) ?? "apify",
        nomeOriginal: asTrimmedString(parsedBody.nome_original) ?? "unknown.csv",
        dataExtracao: asTrimmedString(parsedBody.data_extracao) ?? new Date().toISOString(),
        periodoInicio: asTrimmedString(parsedBody.periodo_inicio),
        periodoFim: asTrimmedString(parsedBody.periodo_fim),
      });

      return jsonResponse(csvResult, csvResult.success ? 200 : 500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Falha ao processar CSV";
      console.error("[uber-webhook] CSV import error:", msg);
      return jsonResponse({ success: false, error: msg }, 500);
    }
  }

  // Daqui para baixo é o processamento de eventos push do Uber (automático).
  // Está desativado — só o import manual por CSV (acima) funciona.
  if (UBER_PUSH_DESATIVADO) {
    return jsonResponse({
      success: true,
      ignored: true,
      message: "Webhook de eventos Uber desativado (apenas import manual por CSV).",
    }, 200);
  }

  const integracaoId = requestUrl.searchParams.get("integracao_id") ?? asTrimmedString(parsedBody.integracao_id);
  if (!integracaoId) {
    return jsonResponse({ success: false, error: "integracao_id é obrigatório" }, 400);
  }

  const { data: configRows, error: configError } = await supabase.rpc("get_uber_platform_config", {
    p_integracao_id: integracaoId,
  });

  if (configError) {
    console.error("Erro ao obter configuração Uber:", configError);
    return jsonResponse({ success: false, error: "Não foi possível obter a configuração da integração" }, 500);
  }

  const config = configRows?.[0];
  if (!config) {
    return jsonResponse({ success: false, error: "Integração Uber não encontrada" }, 404);
  }

  // Use webhook_signing_key (preferred) or fall back to client_secret for backwards compat
  const signingKey = config.webhook_signing_key || config.client_secret;
  if (!signingKey) {
    return jsonResponse({ success: false, error: "Webhook signing key da integração Uber em falta" }, 400);
  }

  const payload = parsedBody;
  const eventId = getEventId(payload, req.headers);
  const eventType = getEventType(payload);
  const uberEnvironment = req.headers.get("x-environment") ?? null;

  // Extract event_time (unix timestamp) and convert to ISO
  const rawEventTime = payload.event_time;
  const eventTimeIso = typeof rawEventTime === "number" && rawEventTime > 0
    ? new Date(rawEventTime * 1000).toISOString()
    : null;

  const signatureValid = await isValidUberSignature(signingKey, rawBody, signature);

  // Enrich headers with X-Environment for traceability
  const enrichedHeaders = { ...headers };
  if (uberEnvironment) enrichedHeaders["x-environment"] = uberEnvironment;
  if (eventTimeIso) enrichedHeaders["x-event-time-iso"] = eventTimeIso;

  if (!signatureValid) {
    await supabase.from("uber_webhook_events").insert({
      integracao_id: integracaoId,
      event_id: eventId,
      event_type: eventType,
      signature,
      payload,
      headers: enrichedHeaders,
      processing_status: "rejected",
      error_message: "Assinatura HMAC inválida",
      processed_at: new Date().toISOString(),
    });

    return jsonResponse({ success: false, error: "Assinatura inválida" }, 401);
  }

  const insertPayload = {
    integracao_id: integracaoId,
    event_id: eventId,
    event_type: eventType,
    signature,
    payload,
    headers: enrichedHeaders,
    processing_status: "received",
    error_message: null,
    processed_at: null,
  };

  const { data: insertedEvent, error: insertError } = await supabase
    .from("uber_webhook_events")
    .insert(insertPayload)
    .select("id, integracao_id, event_id, event_type, payload")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return jsonResponse({ success: true, duplicate: true, message: "Evento já recebido anteriormente" }, 200);
    }

    console.error("Erro ao registar evento Uber:", insertError);
    return jsonResponse({ success: false, error: "Não foi possível guardar o evento" }, 500);
  }

  const lookups = await loadLookups(supabase, integracaoId);
  const result = await processStoredEvent({
    supabase,
    event: insertedEvent as StoredWebhookEvent,
    lookups,
    executadoPor: null,
    replay: false,
  });

  return jsonResponse({
    success: result.status !== "failed",
    counts: result.counts,
    domain: result.domain,
    event_id: eventId,
    event_type: eventType,
    message: result.message,
    processing_status: result.status,
    diagnostics_summary: summarizeDiagnostics(result.diagnostics),
  });
});
