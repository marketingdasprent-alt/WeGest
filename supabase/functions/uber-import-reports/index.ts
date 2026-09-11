import { createClient } from "npm:@supabase/supabase-js@2.105.4";

type UntypedSupabaseClient = ReturnType<typeof createClient<any>>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ─── CSV Parsing Helpers ───

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

const parseAmountValue = (value: string): number | null => {
  if (!value) return null;
  let cleaned = value.replace(/[€$£\s]/g, "").trim();
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTREME_AMOUNT_THRESHOLD = -10000;

// ─── Compute previous week period (Mon→Sun) from a reference date ───
const computeWeekPeriod = (refDateStr: string): { period: string; startIso: string } | null => {
  const ref = new Date(refDateStr);
  if (Number.isNaN(ref.getTime())) return null;
  // Go to previous Sunday (end of report week)
  const dayOfWeek = ref.getUTCDay(); // 0=Sun
  const sunday = new Date(ref);
  sunday.setUTCDate(ref.getUTCDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));
  // Monday = Sunday - 6
  const monday = new Date(sunday);
  monday.setUTCDate(sunday.getUTCDate() - 6);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const period = `${fmt(monday)}-${fmt(sunday)}`;
  const startIso = new Date(`${fmt(monday).slice(0, 4)}-${fmt(monday).slice(4, 6)}-${fmt(monday).slice(6, 8)}T12:00:00Z`).toISOString();
  return { period, startIso };
};

// ─── Pagamentos CSV Column Aliases (reused from uber-webhook) ───

const PAGAMENTOS_ALIASES: Record<string, string[]> = {
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


// ─── Atividade Motoristas (Driver Activity) CSV Column Aliases ───
const ATIVIDADE_ALIASES: Record<string, string[]> = {
  uber_driver_id: ["uuid do motorista", "driver uuid", "driver id", "driver", "motorista"],
  driver_first_name: ["nome próprio do motorista", "nome proprio do motorista", "first name", "nome próprio", "nome proprio"],
  driver_last_name: ["apelido do motorista", "last name", "apelido"],
  viagens_concluidas: ["viagens concluídas", "viagens concluidas", "completed trips", "trips completed", "trips"],
  tempo_online: ["tempo online (dias: horas: minutos)", "tempo online", "online time", "time online"],
  tempo_em_viagem: ["tempo em viagem (dias: horas: minutos)", "tempo em viagem", "trip time", "time on trip"],
};

const mapHeaders = (headers: string[], aliases: Record<string, string[]>): Map<number, string> => {
  const mapping = new Map<number, string>();
  const normalizedHeaders = headers.map((h) =>
    h.toLowerCase().trim().replace(/['"]/g, "").replace(/\s*:\s*/g, ":")
  );
  for (let i = 0; i < normalizedHeaders.length; i++) {
    const header = normalizedHeaders[i];
    for (const [field, fieldAliases] of Object.entries(aliases)) {
      const normalizedAliases = fieldAliases.map((a) => a.replace(/\s*:\s*/g, ":"));
      if (normalizedAliases.includes(header) && !Array.from(mapping.values()).includes(field)) {
        mapping.set(i, field);
        break;
      }
    }
  }
  return mapping;
};

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

// ─── Driver Name Upsert ───

const upsertDriverNames = async (
  supabase: UntypedSupabaseClient,
  integracaoId: string,
  drivers: Map<string, { first_name: string; last_name: string }>,
) => {
  if (drivers.size === 0) return 0;

  const rows = Array.from(drivers.entries()).map(([uuid, { first_name, last_name }]) => ({
    integracao_id: integracaoId,
    uber_driver_id: uuid,
    first_name: first_name || null,
    last_name: last_name || null,
    full_name: `${first_name} ${last_name}`.trim() || null,
    flow_type: "csv_import",
    last_synced_at: new Date().toISOString(),
  }));

  let upserted = 0;
  for (const chunk of chunkArray(rows, 100)) {
    const { error } = await supabase
      .from("uber_drivers")
      .upsert(chunk, { onConflict: "integracao_id,uber_driver_id", ignoreDuplicates: false });
    if (error) {
      console.error("[uber-import-reports] Driver upsert error:", error);
    } else {
      upserted += chunk.length;
    }
  }
  return upserted;
};

// ─── Process Pagamentos CSV ───

const processPagamentosCsv = async (
  supabase: UntypedSupabaseClient,
  integracaoId: string,
  csvText: string,
  nomeOriginal: string,
  origem: string,
  dataExtracao?: string,
) => {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { inserted: 0, updated: 0, errors: 0, skipped: 0, drivers: new Map<string, { first_name: string; last_name: string }>() };

  const separator = detectCsvSeparator(lines[0]);
  const headerCells = parseCsvLine(lines[0], separator);
  const columnMap = mapHeaders(headerCells, PAGAMENTOS_ALIASES);

  if (columnMap.size === 0) {
    console.warn(`[uber-import-reports] Pagamentos: no columns mapped from: ${headerCells.join(", ")}`);
    return { inserted: 0, updated: 0, errors: 0, skipped: 0, drivers: new Map<string, { first_name: string; last_name: string }>() };
  }

  console.info(`[uber-import-reports] Pagamentos: ${lines.length - 1} rows, mapped: ${Array.from(columnMap.entries()).map(([i, f]) => `${headerCells[i]}->${f}`).join(", ")}`);

  const driverNames = new Map<string, { first_name: string; last_name: string }>();
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;

  // Extract period from filename or data_extracao
  let filenamePeriod = "";
  let filenameDate: string | null = null;
  const filenameMatch = nomeOriginal?.match(/(\d{8})-(\d{8})/);
  if (filenameMatch) {
    const startDateStr = filenameMatch[1];
    const endDateStr = filenameMatch[2];
    const parsedStart = new Date(`${startDateStr.slice(0, 4)}-${startDateStr.slice(4, 6)}-${startDateStr.slice(6, 8)}T12:00:00Z`);
    const parsedEnd = new Date(`${endDateStr.slice(0, 4)}-${endDateStr.slice(4, 6)}-${endDateStr.slice(6, 8)}T12:00:00Z`);
    if (!Number.isNaN(parsedStart.getTime()) && !Number.isNaN(parsedEnd.getTime())) {
      // If end date is exactly 7 days after start, treat end as exclusive (Mon-Mon → Mon-Sun)
      const diffDays = Math.round((parsedEnd.getTime() - parsedStart.getTime()) / (86400000));
      const actualEnd = new Date(parsedEnd);
      if (diffDays === 7) {
        actualEnd.setUTCDate(actualEnd.getUTCDate() - 1);
      }
      filenameDate = parsedStart.toISOString();
      const fmt = (d: Date) =>
        `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
      filenamePeriod = `${fmt(parsedStart)}-${fmt(actualEnd)}`;
    } else {
      filenamePeriod = `${filenameMatch[1]}-${filenameMatch[2]}`;
    }
  }
  // Fallback: compute from data_extracao or current date (the report is always for the previous week)
  if (!filenamePeriod) {
    const refDate = dataExtracao || new Date().toISOString();
    const computed = computeWeekPeriod(refDate);
    if (computed) {
      filenamePeriod = computed.period;
      filenameDate = computed.startIso;
      console.info(`[uber-import-reports] Period derived from ${dataExtracao ? 'data_extracao' : 'current date'}: ${filenamePeriod}`);
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], separator);
    const csvRow: Record<string, string> = {};
    for (let j = 0; j < cells.length && j < headerCells.length; j++) {
      csvRow[headerCells[j]] = cells[j];
    }

    const mapped: Record<string, string> = {};
    for (const [colIndex, fieldName] of columnMap.entries()) {
      if (colIndex < cells.length && cells[colIndex]) mapped[fieldName] = cells[colIndex];
    }

    const driverUuid = mapped.uber_driver_id || "";
    const grossAmount = parseAmountValue(mapped.gross_amount || "");
    const netAmount = parseAmountValue(mapped.net_amount || "");

    // Validation
    if (grossAmount !== null && grossAmount < EXTREME_AMOUNT_THRESHOLD) { skipped++; continue; }
    if (netAmount !== null && netAmount < EXTREME_AMOUNT_THRESHOLD) { skipped++; continue; }
    if (driverUuid && !UUID_REGEX.test(driverUuid)) { skipped++; continue; }

    // Collect driver names
    if (driverUuid && UUID_REGEX.test(driverUuid)) {
      const firstName = mapped.driver_first_name || "";
      const lastName = mapped.driver_last_name || "";
      if ((firstName || lastName) && !driverNames.has(driverUuid)) {
        driverNames.set(driverUuid, { first_name: firstName, last_name: lastName });
      }
    }

    const transactionId = mapped.uber_transaction_id
      || (driverUuid && filenamePeriod ? `${driverUuid}-${filenamePeriod}` : "");

    // Skip rows without a deterministic transaction ID to prevent duplicates on reimport
    if (!transactionId) { skipped++; continue; }

    let occurredAt: string | null = null;
    if (mapped.occurred_at) {
      const parsed = new Date(mapped.occurred_at);
      occurredAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    if (!occurredAt && filenameDate) occurredAt = filenameDate;

    rows.push({
      integracao_id: integracaoId,
      uber_transaction_id: transactionId,
      trip_reference: mapped.trip_reference || mapped.uber_transaction_id || null,
      uber_driver_id: driverUuid || null,
      uber_vehicle_id: mapped.uber_vehicle_id || null,
      transaction_type: mapped.transaction_type || "csv_import",
      status: mapped.status || "imported",
      currency: mapped.currency || "EUR",
      gross_amount: grossAmount,
      net_amount: netAmount,
      commission_amount: parseAmountValue(mapped.commission_amount || ""),
      occurred_at: occurredAt || new Date().toISOString(),
      raw_transaction: { csv_row: csvRow, import_source: origem, nome_original: nomeOriginal, periodo: filenamePeriod || null },
    });
  }

  // Upsert transactions
  let totalInserted = 0;
  let totalUpdated = 0;
  let errors = 0;

  for (const chunk of chunkArray(rows, 200)) {
    const { error } = await supabase
      .from("uber_transactions")
      .upsert(chunk, { onConflict: "integracao_id,uber_transaction_id", ignoreDuplicates: false });
    if (error) {
      console.error("[uber-import-reports] Pagamentos upsert error:", error);
      errors += chunk.length;
    } else {
      totalInserted += chunk.length;
    }
  }

  return { inserted: totalInserted, updated: totalUpdated, errors, skipped, drivers: driverNames };
};

// ─── Parse "dias: horas: minutos" → total minutes ───

const parseDhm = (value: string): number | null => {
  if (!value || !value.trim()) return null;
  const cleaned = value.trim();
  // Format: "D: HH: MM" or "D:HH:MM" or just a number
  const parts = cleaned.split(/\s*:\s*/);
  if (parts.length === 3) {
    const days = parseInt(parts[0]) || 0;
    const hours = parseInt(parts[1]) || 0;
    const minutes = parseInt(parts[2]) || 0;
    return days * 24 * 60 + hours * 60 + minutes;
  }
  if (parts.length === 2) {
    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;
    return hours * 60 + minutes;
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
};

// ─── Process Atividade (Driver Activity) CSV ───

const processAtividadeCsv = async (
  supabase: UntypedSupabaseClient,
  integracaoId: string,
  csvText: string,
  nomeOriginal: string,
  dataExtracao?: string,
) => {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { inserted: 0, errors: 0, skipped: 0, drivers: new Map<string, { first_name: string; last_name: string }>(), columns: [] as string[] };

  const separator = detectCsvSeparator(lines[0]);
  const headerCells = parseCsvLine(lines[0], separator);
  const columnMap = mapHeaders(headerCells, ATIVIDADE_ALIASES);

  console.info(`[uber-import-reports] Atividade: ${lines.length - 1} rows, separator="${separator === "\t" ? "TAB" : separator}", headers: ${headerCells.join(", ")}`);
  console.info(`[uber-import-reports] Atividade mapped: ${Array.from(columnMap.entries()).map(([i, f]) => `${headerCells[i]}->${f}`).join(", ")}`);

  // Extract period from filename (e.g. "20260309-20260315-driver_activity-...")
  let periodo = "";
  const filenameMatch = nomeOriginal?.match(/(\d{8})-(\d{8})/);
  if (filenameMatch) {
    const startDateStr = filenameMatch[1];
    const endDateStr = filenameMatch[2];
    const pStart = new Date(`${startDateStr.slice(0, 4)}-${startDateStr.slice(4, 6)}-${startDateStr.slice(6, 8)}T12:00:00Z`);
    const pEnd = new Date(`${endDateStr.slice(0, 4)}-${endDateStr.slice(4, 6)}-${endDateStr.slice(6, 8)}T12:00:00Z`);
    if (!Number.isNaN(pStart.getTime()) && !Number.isNaN(pEnd.getTime())) {
      const diffDays = Math.round((pEnd.getTime() - pStart.getTime()) / 86400000);
      const actualEnd = new Date(pEnd);
      if (diffDays === 7) {
        actualEnd.setUTCDate(actualEnd.getUTCDate() - 1);
      }
      const fmt = (d: Date) =>
        `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
      periodo = `${fmt(pStart)}-${fmt(actualEnd)}`;
    } else {
      periodo = `${filenameMatch[1]}-${filenameMatch[2]}`;
    }
  }
  // Fallback: compute from data_extracao or current date
  if (!periodo) {
    const refDate = dataExtracao || new Date().toISOString();
    const computed = computeWeekPeriod(refDate);
    if (computed) {
      periodo = computed.period;
      console.info(`[uber-import-reports] Atividade period derived from ${dataExtracao ? 'data_extracao' : 'current date'}: ${periodo}`);
    }
  }

  const driverNames = new Map<string, { first_name: string; last_name: string }>();
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], separator);
    const rawRow: Record<string, string> = {};
    for (let j = 0; j < cells.length && j < headerCells.length; j++) {
      rawRow[headerCells[j]] = cells[j];
    }

    const mapped: Record<string, string> = {};
    for (const [colIndex, fieldName] of columnMap.entries()) {
      if (colIndex < cells.length && cells[colIndex]) mapped[fieldName] = cells[colIndex];
    }

    const driverUuid = mapped.uber_driver_id || "";
    if (!driverUuid || !UUID_REGEX.test(driverUuid)) { skipped++; continue; }

    // Collect driver names
    const firstName = mapped.driver_first_name || "";
    const lastName = mapped.driver_last_name || "";
    if ((firstName || lastName) && !driverNames.has(driverUuid)) {
      driverNames.set(driverUuid, { first_name: firstName, last_name: lastName });
    }

    const driverName = [firstName, lastName].filter(Boolean).join(" ") || null;
    const viagensConcluidas = parseInt(mapped.viagens_concluidas || "0") || 0;
    const tempoOnline = parseDhm(mapped.tempo_online || "");
    const tempoEmViagem = parseDhm(mapped.tempo_em_viagem || "");

    rows.push({
      integracao_id: integracaoId,
      uber_driver_id: driverUuid,
      driver_name: driverName,
      viagens_concluidas: viagensConcluidas,
      tempo_online_minutos: tempoOnline,
      tempo_em_viagem_minutos: tempoEmViagem,
      periodo: periodo || null,
      raw_row: rawRow,
    });
  }

  // Upsert atividade
  let totalInserted = 0;
  let errors = 0;

  for (const chunk of chunkArray(rows, 200)) {
    const { error } = await supabase
      .from("uber_atividade_motoristas")
      .upsert(chunk, { onConflict: "integracao_id,uber_driver_id,periodo", ignoreDuplicates: false });
    if (error) {
      console.error("[uber-import-reports] Atividade upsert error:", error);
      errors += chunk.length;
    } else {
      totalInserted += chunk.length;
    }
  }

  return { inserted: totalInserted, errors, skipped, drivers: driverNames, columns: headerCells };
};

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Método não suportado" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "Configuração Supabase em falta" }, 500);
  }

  // Auth: only SERVICE_ROLE_KEY
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (bearerToken !== serviceRoleKey) {
    return jsonResponse({ success: false, error: "Autenticação inválida. Use SERVICE_ROLE_KEY." }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "JSON inválido" }, 400);
  }

  let integracaoId = (body.integracao_id as string) || new URL(req.url).searchParams.get("integracao_id");

  if (!integracaoId) {
    // Auto-resolve: find the single active Uber integration
    const { data: uberConfigs } = await supabase
      .from("plataformas_configuracao")
      .select("id")
      .eq("plataforma", "uber")
      .limit(2);

    if (uberConfigs?.length === 1) {
      integracaoId = uberConfigs[0].id;
      console.info(`[uber-import-reports] Auto-resolved integracao_id: ${integracaoId}`);
    } else {
      const msg = !uberConfigs?.length
        ? "integracao_id é obrigatório (nenhuma integração Uber encontrada)"
        : "integracao_id é obrigatório (múltiplas integrações Uber encontradas)";
      return jsonResponse({ success: false, error: msg }, 400);
    }
  }

  if (typeof integracaoId !== "string" || !integracaoId) {
    return jsonResponse({ success: false, error: "integracao_id inválido" }, 400);
  }
  const resolvedIntegracaoId = integracaoId;

  // Verify integration exists (accept both 'uber' and 'robot' platforms)
  const { data: configRow, error: configError } = await supabase
    .from("plataformas_configuracao")
    .select("id, nome, plataforma, ativo")
    .eq("id", resolvedIntegracaoId)
    .single();
  if (configError || !configRow) {
    return jsonResponse({ success: false, error: "Integração não encontrada" }, 404);
  }

  // Accept both canonical keys and legacy aliases from the Apify bot
  const pagamentosCsv = (body.pagamentos_csv ?? body.dados_csv_pagamentos) as string | undefined;
  const viagensCsv = (body.viagens_csv ?? body.dados_csv_atividades) as string | undefined;
  const origem = (body.origem as string) || "Apify Bot";
  const dataExtracao = (body.data_extracao as string) || "";
  const nomeOriginalPagamentos = (body.nome_pagamentos as string) || "pagamentos.csv";
  const nomeOriginalViagens = (body.nome_viagens as string) || "viagens.csv";

  if (!pagamentosCsv && !viagensCsv) {
    return jsonResponse({ success: false, error: "Pelo menos um CSV é obrigatório (pagamentos_csv ou viagens_csv)" }, 400);
  }

  const results: Record<string, unknown> = {};
  const allDrivers = new Map<string, { first_name: string; last_name: string }>();

  // Process pagamentos
  if (pagamentosCsv) {
    try {
      const pagResult = await processPagamentosCsv(supabase, resolvedIntegracaoId, pagamentosCsv, nomeOriginalPagamentos, origem, dataExtracao);
      results.pagamentos = { inserted: pagResult.inserted, updated: pagResult.updated, errors: pagResult.errors, skipped: pagResult.skipped };
      for (const [uuid, name] of pagResult.drivers) allDrivers.set(uuid, name);
    } catch (error) {
      console.error("[uber-import-reports] Pagamentos error:", error);
      results.pagamentos = { error: error instanceof Error ? error.message : "Erro ao processar pagamentos" };
    }
  }

  // Process atividade (driver activity)
  if (viagensCsv) {
    try {
      const atividadeResult = await processAtividadeCsv(supabase, resolvedIntegracaoId, viagensCsv, nomeOriginalViagens, dataExtracao);
      results.atividade = { inserted: atividadeResult.inserted, errors: atividadeResult.errors, skipped: atividadeResult.skipped, columns_detected: atividadeResult.columns };
      for (const [uuid, name] of atividadeResult.drivers) {
        if (!allDrivers.has(uuid)) allDrivers.set(uuid, name);
      }
    } catch (error) {
      console.error("[uber-import-reports] Atividade error:", error);
      results.atividade = { error: error instanceof Error ? error.message : "Erro ao processar atividade" };
    }
  }

  // Upsert driver names from both CSVs
  const driversUpserted = await upsertDriverNames(supabase, resolvedIntegracaoId, allDrivers);
  results.drivers_upserted = driversUpserted;

  // Log
  await supabase.from("uber_sync_logs").insert({
    integracao_id: resolvedIntegracaoId,
    executado_por: null,
    tipo: "csv_import",
    status: "success",
    mensagem: `Importação dupla: pagamentos=${pagamentosCsv ? "sim" : "não"}, viagens=${viagensCsv ? "sim" : "não"}, motoristas=${driversUpserted}`,
    erros: 0,
    detalhes: { origem, results },
  });

  // Update last_webhook_at, ultimo_sync and activate integration
  const nowIso = new Date().toISOString();
  await supabase
    .from("plataformas_configuracao")
    .update({ last_webhook_at: nowIso, ultimo_sync: nowIso, ativo: true })
    .eq("id", resolvedIntegracaoId);

  // Trigger auto-mapping for this integration
  try {
    console.info(`[uber-import-reports] Triggering auto-map for integration: ${resolvedIntegracaoId}`);
    const { data: autoMapData, error: autoMapError } = await supabase.functions.invoke("uber-auto-map-drivers", {
      body: { integracao_id: resolvedIntegracaoId },
    });
    
    if (autoMapError) {
      console.error("[uber-import-reports] Auto-map trigger failed:", autoMapError);
      results.auto_map = { error: autoMapError.message };
    } else {
      results.auto_map = autoMapData || { success: true };
      console.info(`[uber-import-reports] Auto-map result: ${autoMapData?.message || 'success'}`);
    }
  } catch (err) {
    console.error("[uber-import-reports] Auto-map exception:", err);
    results.auto_map = { error: err instanceof Error ? err.message : String(err) };
  }

  return jsonResponse({ success: true, ...results });

});
