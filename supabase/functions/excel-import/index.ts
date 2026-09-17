import { createClient } from 'npm:@supabase/supabase-js@2.105.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExcelRow {
  observacoes?: string;
  nome?: string;
  gestor?: string;
  marca?: string;
  modelo?: string;
  tvde?: string;
  matricula?: string;
  cartao_combustivel?: string;
  data_inicio?: string;
  data_saida?: string;
  valor_viatura?: string;
  caucao?: string;
  km?: string;
  nib?: string;
  movel?: string;
  email?: string;
  localizacao?: string;
  nif?: string;
}

interface ImportResult {
  row: number;
  nome: string;
  matricula: string;
  status: 'ok' | 'erro' | 'aviso';
  message: string;
}

const parseCurrency = (val: string): number | null => {
  if (!val || val.trim() === '' || val.trim() === 'N/A' || val.trim() === '-----') return null;
  const cleaned = val.replace(/[€\s]/g, '').replace(',', '.').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const parseKm = (val: string): number | null => {
  if (!val || val.trim() === '' || val.trim() === 'N/A' || val.trim() === '-----') return null;
  const n = parseInt(val.replace(/\D/g, ''));
  return Number.isFinite(n) ? n : null;
};

const parseDate = (val: string): string | null => {
  if (!val || val.trim() === '' || val.trim() === 'N/A') return null;
  const match = val.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return null;
};

const resolveGestorId = (
  initials: string,
  profiles: Array<{ id: string; nome: string | null }>
): string | null => {
  if (!initials || initials.trim() === '' || initials.trim() === '-----') return null;
  const upper = initials.trim().toUpperCase();
  for (const p of profiles) {
    if (!p.nome) continue;
    const words = p.nome.trim().split(/\s+/).filter(Boolean);
    const profileInitials = words.map((w) => w[0].toUpperCase()).join('');
    if (profileInitials === upper || profileInitials.startsWith(upper)) return p.id;
  }
  return null;
};

const normMatricula = (m: string): string => {
  const raw = m.trim().replace(/[-\s]/g, '').toUpperCase();
  if (raw.length === 6) return `${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`;
  return raw;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return new Response(JSON.stringify({ error: 'Token em falta' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: authErr,
  } = await anonClient.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Sessão inválida' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  let rows: ExcelRow[];
  let callerOrgId: string;
  try {
    const body = await req.json();
    rows = body.rows;
    callerOrgId = body.org_id;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('rows vazio');
    if (!callerOrgId) throw new Error('org_id em falta');
  } catch {
    return new Response(
      JSON.stringify({ error: 'Payload inválido. Envie { rows: [...], org_id }' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  const { data: callerMembership } = await supabase
    .from('user_organizacoes')
    .select('is_admin')
    .eq('user_id', user.id)
    .eq('org_id', callerOrgId)
    .single();
  if (!callerMembership?.is_admin) {
    return new Response(JSON.stringify({ error: 'Sem permissão de administrador' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, nome')
    .eq('org_id', callerOrgId);

  const results: ImportResult[] = [];
  let ok = 0,
    erros = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    const nomeTrim = row.nome?.trim() || '';
    const matriculaTrim = row.matricula?.trim() || '';

    if (!nomeTrim && !matriculaTrim) continue;
    if (nomeTrim === '-----' && matriculaTrim === '-----') continue;

    try {
      let motoristaId: string | null = null;

      const nifTrim = row.nif?.trim() || '';
      const gestorId = resolveGestorId(row.gestor || '', allProfiles || []);
      const gestorNome = gestorId
        ? ((allProfiles || []).find((p) => p.id === gestorId)?.nome ?? null)
        : null;
      const caucaoVal = parseCurrency(row.caucao || '');
      const valorViatura = parseCurrency(row.valor_viatura || '');
      const kmVal = parseKm(row.km || '');
      const isSlot = row.tvde?.trim().toUpperCase() === 'SLOT';

      const motoristaPayload: Record<string, unknown> = {
        nome: nomeTrim || null,
        nif: nifTrim || null,
        email: row.email?.trim().toLowerCase() || null,
        morada: row.localizacao?.trim() || null,
        telefone: row.movel?.trim() || null,
        iban: row.nib?.trim() || null,
        caucao_valor: caucaoVal,
        gestor_responsavel: gestorNome,
        observacoes: row.observacoes?.trim() || null,
        org_id: callerOrgId,
      };

      Object.keys(motoristaPayload).forEach((k) => {
        if (motoristaPayload[k] === null || motoristaPayload[k] === undefined) {
          delete motoristaPayload[k];
        }
      });

      if (nifTrim && nifTrim !== 'N/A') {
        const { data: existing } = await supabase
          .from('motoristas_ativos')
          .select('id')
          .eq('nif', nifTrim)
          .eq('org_id', callerOrgId)
          .maybeSingle();

        if (existing) {
          await supabase.from('motoristas_ativos').update(motoristaPayload).eq('id', existing.id);
          motoristaId = existing.id;
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from('motoristas_ativos')
            .insert({ ...motoristaPayload, nif: nifTrim })
            .select('id')
            .single();
          if (insErr) throw new Error(`Motorista insert: ${insErr.message}`);
          motoristaId = inserted.id;
        }
      } else if (nomeTrim) {
        const { data: existing } = await supabase
          .from('motoristas_ativos')
          .select('id')
          .ilike('nome', nomeTrim)
          .eq('org_id', callerOrgId)
          .maybeSingle();

        if (existing) {
          await supabase.from('motoristas_ativos').update(motoristaPayload).eq('id', existing.id);
          motoristaId = existing.id;
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from('motoristas_ativos')
            .insert(motoristaPayload)
            .select('id')
            .single();
          if (insErr) throw new Error(`Motorista insert: ${insErr.message}`);
          motoristaId = inserted.id;
        }
      }

      let viaturaId: string | null = null;

      if (matriculaTrim && matriculaTrim !== '-----' && matriculaTrim !== 'N/A') {
        const mat = normMatricula(matriculaTrim);

        const viaturaPayload: Record<string, unknown> = {
          matricula: mat,
          marca: row.marca?.trim() !== '-----' && row.marca?.trim() ? row.marca.trim() : undefined,
          modelo:
            row.modelo?.trim() !== '-----' && row.modelo?.trim() ? row.modelo.trim() : undefined,
          valor_aluguer: valorViatura ?? undefined,
          km_atual: kmVal ?? undefined,
          is_slot: isSlot,
          org_id: callerOrgId,
        };

        Object.keys(viaturaPayload).forEach((k) => {
          if (viaturaPayload[k] === undefined) delete viaturaPayload[k];
        });

        const { data: existingV } = await supabase
          .from('viaturas')
          .select('id')
          .eq('matricula', mat)
          .eq('org_id', callerOrgId)
          .maybeSingle();

        if (existingV) {
          await supabase.from('viaturas').update(viaturaPayload).eq('id', existingV.id);
          viaturaId = existingV.id;
        } else {
          const insertPayload = {
            ...viaturaPayload,
            marca: (viaturaPayload.marca as string) || '—',
            modelo: (viaturaPayload.modelo as string) || '—',
            status: 'disponivel',
          };
          const { data: insertedV, error: insVErr } = await supabase
            .from('viaturas')
            .insert(insertPayload)
            .select('id')
            .single();
          if (insVErr) throw new Error(`Viatura insert: ${insVErr.message}`);
          viaturaId = insertedV.id;
        }
      }

      if (motoristaId && viaturaId) {
        const dataInicio = parseDate(row.data_inicio || '');
        const dataSaida = parseDate(row.data_saida || '');

        if (dataInicio) {
          const { data: existingAssoc } = await supabase
            .from('motorista_viaturas')
            .select('id')
            .eq('motorista_id', motoristaId)
            .eq('viatura_id', viaturaId)
            .eq('data_inicio', dataInicio)
            .maybeSingle();

          if (!existingAssoc) {
            await supabase.from('motorista_viaturas').insert({
              motorista_id: motoristaId,
              viatura_id: viaturaId,
              data_inicio: dataInicio,
              data_fim: dataSaida || null,
              status: dataSaida ? 'encerrado' : 'ativo',
              org_id: callerOrgId,
            });

            if (!dataSaida) {
              await supabase.from('viaturas').update({ status: 'em_uso' }).eq('id', viaturaId);
            }
          } else if (dataSaida) {
            await supabase
              .from('motorista_viaturas')
              .update({ data_fim: dataSaida, status: 'encerrado' })
              .eq('id', existingAssoc.id);
          }
        }
      }

      const cartaoNum = row.cartao_combustivel?.trim() || '';
      if (cartaoNum && cartaoNum !== 'N/A' && cartaoNum !== '-----') {
        const { data: cartao } = await supabase
          .from('bp_cartoes')
          .select('id')
          .eq('card_number', cartaoNum)
          .maybeSingle();

        if (cartao) {
          const cartaoUpdate: Record<string, unknown> = {};
          if (motoristaId) cartaoUpdate.motorista_id = motoristaId;
          if (viaturaId) cartaoUpdate.viatura_id = viaturaId;
          if (Object.keys(cartaoUpdate).length > 0) {
            await supabase.from('bp_cartoes').update(cartaoUpdate).eq('id', cartao.id);
          }
        }
      }

      results.push({
        row: rowNum,
        nome: nomeTrim,
        matricula: matriculaTrim,
        status: 'ok',
        message: 'Importado com sucesso',
      });
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        row: rowNum,
        nome: row.nome || '',
        matricula: row.matricula || '',
        status: 'erro',
        message: msg,
      });
      erros++;
      console.error(`[excel-import] Row ${rowNum} error:`, msg);
    }
  }

  return new Response(JSON.stringify({ success: true, total: rows.length, ok, erros, results }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
