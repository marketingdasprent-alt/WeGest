import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OWN_FLEET_OWNER = 'Década Ousada';

interface ImportRequest {
  rows?: Record<string, unknown>[];
  rawMarkdown?: string;
  fileUrl?: string;
  dryRun?: boolean;
}

interface Summary {
  totalRows: number;
  validRows: number;
  created: number;
  updated: number;
  ownerCreates: number;
  skipped: number;
  errors: number;
  warnings: string[];
}

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizeHeader = (value: string) => normalizeText(value).replace(/\s+/g, ' ');
const normalizePlate = (value: unknown) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalizeOwnerName = (value: unknown) => normalizeText(value).replace(/\s+/g, ' ');

const formatPlate = (value: unknown) => {
  const normalized = normalizePlate(value);
  if (normalized.length === 6) {
    return `${normalized.slice(0, 2)}-${normalized.slice(2, 4)}-${normalized.slice(4, 6)}`;
  }
  return String(value ?? '').trim().toUpperCase();
};

const parseInteger = (value: unknown) => {
  const normalized = String(value ?? '').replace(/[^\d-]/g, '');
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDate = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y.toString().padStart(4, '0')}-${parsed.m.toString().padStart(2, '0')}-${parsed.d.toString().padStart(2, '0')}`;
  }

  const text = String(value).trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parts = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (parts) {
    const [, day, month, year] = parts;
    const resolvedYear = year.length === 2 ? `20${year}` : year;
    return `${resolvedYear.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const mapFuel = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.includes('diesel')) return 'diesel';
  if (normalized.includes('hibr')) return 'hibrido';
  if (normalized.includes('eletric')) return 'eletrico';
  if (normalized.includes('petrol') || normalized.includes('gasolina')) return 'gasolina';
  return null;
};

const mapStatus = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized === 'disponivel') return 'disponivel';
  if (normalized === 'alugada') return 'em_uso';
  if (
    normalized === 'impro' ||
    normalized.includes('reparacao') ||
    normalized.includes('manutencao')
  ) {
    return 'manutencao';
  }
  if (normalized === 'vendida') return 'vendida';
  if (normalized === 'inativo' || normalized === 'inactiva' || normalized === 'inativa') return 'inativo';
  return null;
};

const buildNormalizedRow = (row: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = value;
  }
  return normalized;
};

const getCell = (row: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
};

const parseMarkdownTable = (rawMarkdown: string) => {
  const lines = rawMarkdown.split(/\r?\n/);
  let headers: string[] | null = null;
  const rows: Record<string, unknown>[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (!headers) {
      if (cells.some((cell) => normalizeHeader(cell) === 'matricula')) {
        headers = cells;
      }
      continue;
    }

    if (cells.every((cell) => /^-+$/.test(cell))) continue;
    if (cells.length !== headers.length) continue;

    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    rows.push(row);
  }

  return rows;
};

const parseRowsFromFile = async (fileUrl: string) => {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Não foi possível obter o ficheiro em ${fileUrl}`);
  }

  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
    raw: false,
  });
};

const resolveOwnerName = (row: Record<string, unknown>) => {
  const explicitOwner = String(getCell(row, 'Ent. Proprietária')).trim();
  if (explicitOwner) return explicitOwner;

  const fleetDescription = normalizeText(getCell(row, 'Tipo Viatura'));
  if (fleetDescription.includes('nossa frota')) {
    return OWN_FLEET_OWNER;
  }

  return null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header is required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );

    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Utilizador não autenticado.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const currentUser = authData.user;

    const body = (await req.json()) as ImportRequest;

    const orgId = (body as ImportRequest & { org_id?: string }).org_id;
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'org_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin DESTA org (user_organizacoes), OU permissão per-org (has_permission já é org-scoped).
    const [{ data: membership }, { data: canCreate }, { data: canEdit }] = await Promise.all([
      supabaseAdmin
        .from('user_organizacoes')
        .select('is_admin')
        .eq('user_id', currentUser.id)
        .eq('org_id', orgId)
        .maybeSingle(),
      supabaseAdmin.rpc('has_permission', { _user_id: currentUser.id, _recurso: 'viaturas_criar' }),
      supabaseAdmin.rpc('has_permission', { _user_id: currentUser.id, _recurso: 'viaturas_editar' }),
    ]);

    if (!membership?.is_admin && !(canCreate && canEdit)) {
      return new Response(JSON.stringify({ error: 'Sem permissão para importar viaturas.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let rawRows = body.rows || [];
    if (!rawRows.length && body.rawMarkdown) {
      rawRows = parseMarkdownTable(body.rawMarkdown);
    }
    if (!rawRows.length && body.fileUrl) {
      rawRows = await parseRowsFromFile(body.fileUrl);
    }

    if (!rawRows.length) {
      return new Response(JSON.stringify({ error: 'Nenhuma linha válida foi enviada para importar.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingVehicles, error: vehiclesError } = await supabaseAdmin
      .from('viaturas')
      .select('id, matricula');

    if (vehiclesError) throw vehiclesError;

    const { data: existingOwners, error: ownersError } = await supabaseAdmin
      .from('viatura_proprietarios')
      .select('id, nome');

    if (ownersError) throw ownersError;

    const vehicleByPlate = new Map<string, { id: string; matricula: string }>();
    for (const vehicle of existingVehicles || []) {
      const normalized = normalizePlate(vehicle.matricula);
      if (!normalized || vehicleByPlate.has(normalized)) continue;
      vehicleByPlate.set(normalized, vehicle);
    }

    const ownerByName = new Map<string, { id: string; nome: string }>();
    for (const owner of existingOwners || []) {
      const normalized = normalizeOwnerName(owner.nome);
      if (!normalized) continue;
      ownerByName.set(normalized, owner);
    }

    const dryRun = Boolean(body.dryRun);
    const summary: Summary = {
      totalRows: rawRows.length,
      validRows: 0,
      created: 0,
      updated: 0,
      ownerCreates: 0,
      skipped: 0,
      errors: 0,
      warnings: [],
    };

    const announcedNewOwners = new Set<string>();

    for (let index = 0; index < rawRows.length; index += 1) {
      const sourceRow = buildNormalizedRow(rawRows[index]);
      const plateValue = getCell(sourceRow, 'Matrícula');
      const normalizedPlate = normalizePlate(plateValue);

      if (!normalizedPlate) {
        summary.skipped += 1;
        summary.warnings.push(`Linha ${index + 2}: sem matrícula, ignorada.`);
        continue;
      }

      const status = mapStatus(getCell(sourceRow, 'Estado'));
      if (!status) {
        summary.skipped += 1;
        summary.warnings.push(`Linha ${index + 2}: estado inválido para ${formatPlate(plateValue)}.`);
        continue;
      }

      const ownerName = resolveOwnerName(sourceRow);
      const ownerKey = ownerName ? normalizeOwnerName(ownerName) : null;
      summary.validRows += 1;

      if (ownerKey && !ownerByName.has(ownerKey) && !announcedNewOwners.has(ownerKey)) {
        summary.ownerCreates += 1;
        announcedNewOwners.add(ownerKey);
      }

      const payload = {
        matricula: formatPlate(plateValue),
        marca: String(getCell(sourceRow, 'Marca')).trim() || 'N/D',
        modelo: String(getCell(sourceRow, 'Modelo')).trim() || 'N/D',
        ano: parseDate(getCell(sourceRow, 'Data Matrícula'))
          ? Number.parseInt(parseDate(getCell(sourceRow, 'Data Matrícula'))!.slice(0, 4), 10)
          : null,
        cor: String(getCell(sourceRow, 'Cor')).trim() || null,
        combustivel: mapFuel(getCell(sourceRow, 'Combustível')),
        status,
        km_atual: parseInteger(getCell(sourceRow, 'Kilómetros')),
        seguro_numero: String(getCell(sourceRow, 'Número do Seguro')).trim() || null,
        seguro_validade: parseDate(getCell(sourceRow, 'Validade Seguro')),
        inspecao_validade: parseDate(getCell(sourceRow, 'Data Próxima Inspeção')),
        numero_motor: String(getCell(sourceRow, 'Número Motor')).trim() || null,
        numero_chassis: String(getCell(sourceRow, 'Número Chassis')).trim() || null,
        data_matricula: parseDate(getCell(sourceRow, 'Data Matrícula')),
        seguradora: String(getCell(sourceRow, 'Seguradora')).trim() || null,
        obe_numero: String(getCell(sourceRow, 'Nº OBE')).trim() || null,
        is_vendida: status === 'vendida',
        status: status === 'vendida' ? 'inativo' : status,
        data_venda: status === 'vendida' ? parseDate(getCell(sourceRow, 'Data Venda')) : null,
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>;

      if (dryRun) {
        if (vehicleByPlate.has(normalizedPlate)) {
          summary.updated += 1;
        } else {
          summary.created += 1;
          vehicleByPlate.set(normalizedPlate, { id: `preview-${normalizedPlate}`, matricula: payload.matricula as string });
        }
        continue;
      }

      try {
        let ownerId: string | null = null;
        if (ownerName && ownerKey) {
          const existingOwner = ownerByName.get(ownerKey);
          if (existingOwner) {
            ownerId = existingOwner.id;
          } else {
            const { data: insertedOwner, error: insertOwnerError } = await supabaseAdmin
              .from('viatura_proprietarios')
              .insert({ nome: ownerName })
              .select('id, nome')
              .single();

            if (insertOwnerError) throw insertOwnerError;
            ownerByName.set(ownerKey, insertedOwner);
            ownerId = insertedOwner.id;
          }
        }

        payload.proprietario_id = ownerId;

        const existingVehicle = vehicleByPlate.get(normalizedPlate);
        if (existingVehicle) {
          const { error: updateError } = await supabaseAdmin
            .from('viaturas')
            .update(payload)
            .eq('id', existingVehicle.id);

          if (updateError) throw updateError;
          summary.updated += 1;
        } else {
          const { data: insertedVehicle, error: insertError } = await supabaseAdmin
            .from('viaturas')
            .insert(payload)
            .select('id, matricula')
            .single();

          if (insertError) throw insertError;
          vehicleByPlate.set(normalizedPlate, insertedVehicle);
          summary.created += 1;
        }
      } catch (error) {
        summary.errors += 1;
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        summary.warnings.push(`Linha ${index + 2}: erro ao importar ${formatPlate(plateValue)} — ${message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro na importação de viaturas:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno na importação.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
