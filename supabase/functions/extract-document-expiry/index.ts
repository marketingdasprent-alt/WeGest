import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { authenticateUser, AuthorizationError } from '../_shared/auth/edgeAuthorization.ts';

// Extrai a data de validade de um documento de motorista com o Gemini.
//
// O ficheiro sai do bucket privado motorista-documentos e vai inteiro para um
// fornecedor externo, por isso a função só o faz para quem PODE ver esse
// documento. A prova é dada pela RLS: com a sessão do chamador, o caminho tem
// de aparecer em motorista_documentos.ficheiro_url ou num dos campos oficiais
// de motoristas_ativos — ou ter sido carregado pelo próprio (o caminho começa
// pelo seu user_id, como o DocumentUploader escreve). Antes disto bastava
// adivinhar um caminho para ler o documento de qualquer motorista de qualquer
// org (auditoria 2026-09-16).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

// Campos de motoristas_ativos que guardam caminhos no bucket motorista-documentos
// (espelha TIPOS_DOCUMENTO em MotoristaTabDocumentos.tsx).
const CAMPOS_FICHEIRO_MOTORISTA = [
  'documento_ficheiro_url',
  'documento_identificacao_verso_url',
  'carta_ficheiro_url',
  'carta_conducao_verso_url',
  'licenca_tvde_ficheiro_url',
  'registo_criminal_url',
  'comprovativo_morada_url',
  'comprovativo_iban_url',
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { filePath, mimeType } = await req.json();
    if (!filePath || typeof filePath !== 'string') {
      return json({ date: null, error: 'filePath is required' }, 400);
    }
    if (filePath.includes('..') || filePath.startsWith('/')) {
      return json({ date: null, error: 'filePath inválido' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ── Quem chama ──────────────────────────────────────────────────────────
    const authClient = createClient(supabaseUrl, anonKey);
    const user = await authenticateUser(req, {
      getUser: async (token) => {
        const { data, error } = await authClient.auth.getUser(token);
        return { user: error || !data.user ? null : { id: data.user.id } };
      },
    });

    // ── Pode ver este documento? (RLS com a sessão do chamador) ─────────────
    let autorizado = filePath.startsWith(`${user.id}/`);

    if (!autorizado) {
      const caller = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });

      const { data: docExtra } = await caller
        .from('motorista_documentos')
        .select('id')
        .eq('ficheiro_url', filePath)
        .limit(1)
        .maybeSingle();
      autorizado = !!docExtra;

      if (!autorizado) {
        const orFilter = CAMPOS_FICHEIRO_MOTORISTA.map((c) => `${c}.eq.${filePath}`).join(',');
        const { data: motorista } = await caller
          .from('motoristas_ativos')
          .select('id')
          .or(orFilter)
          .limit(1)
          .maybeSingle();
        autorizado = !!motorista;
      }
    }

    if (!autorizado) throw new AuthorizationError('Sem acesso a este documento.', 403);

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return json({ date: null, error: 'GEMINI_API_KEY not configured' });
    }

    // Download file from storage
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: fileData, error: dlError } = await supabase.storage
      .from('motorista-documentos')
      .download(filePath);

    if (dlError || !fileData) {
      return json({ date: null, error: dlError?.message }, 400);
    }

    if (fileData.size > MAX_BYTES) {
      return json({ date: null, error: 'Ficheiro demasiado grande para análise' }, 413);
    }

    // Determine media type
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const resolvedMime =
      (typeof mimeType === 'string' && ALLOWED_MIME.has(mimeType) ? mimeType : null) ??
      (ext === 'pdf' ? 'application/pdf' :
       ext === 'png' ? 'image/png' :
       ext === 'webp' ? 'image/webp' :
       'image/jpeg');

    // Convert to base64 (chunk to avoid stack overflow)
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64Data = btoa(binary);

    // Build Gemini content part
    const inlinePart = {
      inline_data: {
        mime_type: resolvedMime,
        data: base64Data,
      },
    };

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              inlinePart,
              {
                text: `Analisa este documento e encontra a data de VALIDADE/EXPIRAÇÃO.
REGRAS IMPORTANTES:
- Procura especificamente por campos como "Validade", "Válido até", "Data de validade", "Expiry", "Valid until", "CÓDIGO VIGENTE ATÉ", "ACCESS CODE VALID UNTIL", "Válido até", "Válidade"
- IGNORA completamente números de referência, números de certificado, números de processo, NIFs, NISPs e qualquer número que não esteja explicitamente identificado como data de validade
- IGNORA o ano presente em números de documento como "n.º 1062037/2026" — esse não é uma data de validade
- IGNORA a "DATA DE NASCIMENTO" / "DATE OF BIRTH" — essa não é a validade
- A data de validade é normalmente uma data futura (vários anos no futuro)
- Responde SOMENTE com a data no formato YYYY-MM-DD (ex: 2031-03-19)
- Se não encontrares nenhuma data de validade explícita, responde apenas com a palavra: null`,
              },
            ],
          }],
          generationConfig: { maxOutputTokens: 30, temperature: 0 },
        }),
      }
    );

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      console.error('Gemini error:', geminiResp.status, errText);
      return json({ date: null, error: `AI API error (${geminiResp.status}): ${errText.substring(0, 200)}` });
    }

    const aiResult = await geminiResp.json();
    console.log('Gemini full response:', JSON.stringify(aiResult).substring(0, 500));

    // Verificar erro da API
    if (aiResult.error) {
      console.error('Gemini API error:', aiResult.error);
      return json({ date: null, debug: `Gemini error: ${aiResult.error.message}` });
    }

    const rawText = (aiResult.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
    console.log('Gemini raw text:', rawText);

    let date: string | null = null;

    // 1. YYYY-MM-DD
    const isoMatch = rawText.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      date = isoMatch[0];
    }

    // 1b. YYYY/MM/DD (ex: registo criminal "2026/06/15")
    if (!date) {
      const ymdSlashMatch = rawText.match(/(\d{4})\/(\d{2})\/(\d{2})/);
      if (ymdSlashMatch) {
        date = `${ymdSlashMatch[1]}-${ymdSlashMatch[2]}-${ymdSlashMatch[3]}`;
      }
    }

    // 2. DD/MM/YYYY  ou  DD-MM-YYYY
    if (!date) {
      const dmyMatch = rawText.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (dmyMatch) {
        date = `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
      }
    }

    // 3. MM/YYYY ou M/YYYY  (sem dia — assume dia 01)
    if (!date) {
      const myMatch = rawText.match(/(\d{1,2})[\/\-](\d{4})/);
      if (myMatch) {
        date = `${myMatch[2]}-${myMatch[1].padStart(2, '0')}-01`;
      }
    }

    // Validação básica: data deve ser futura (>= 2000)
    if (date) {
      const year = parseInt(date.substring(0, 4));
      if (year < 2000 || year > 2099) date = null;
    }

    return json({ date, debug: date ? undefined : `rawText: "${rawText}"` });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return json({ date: null, error: err.message }, err.status);
    }
    console.error('extract-document-expiry error:', err);
    return json({ date: null, error: err.message }, 500);
  }
});
