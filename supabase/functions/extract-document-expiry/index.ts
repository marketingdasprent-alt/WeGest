import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { authenticateUser, AuthorizationError } from '../_shared/auth/edgeAuthorization.ts';

// Extrai a validade de um documento com o Gemini. Só descarrega se a sessão
// do chamador puder ver esse documento via RLS (auditoria 2026-09-16).

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

// Os nomes dos modelos do Gemini caducam sem aviso. Esta função pedia
// `gemini-2.0-flash`, que em 09/2026 passou a devolver 404 ("no longer
// available to new users") — a leitura da validade deixou de funcionar e
// falhava em silêncio, como se o documento é que fosse ilegível. Ninguém deu
// por isso porque o ecrã só diz "não foi encontrada a data".
//
// Tenta-se uma lista por ordem e fica-se pelo primeiro que responde: o
// substituto que a própria API indicou, e os `-latest` no fim, que não caducam.
// Mesma lista da ler-km-odometro — se um dia isto crescer, vale a pena mudá-la
// para _shared.
const MODELOS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
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

    const corpoPedido = JSON.stringify({
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
      // Folga grande para uma data, de propósito: estes modelos pensam
      // antes de responder e o raciocínio conta para o limite. Com 30
      // tokens gastavam-no todo a pensar e devolviam vazio.
      generationConfig: { maxOutputTokens: 512, temperature: 0 },
    });

    // deno-lint-ignore no-explicit-any
    let aiResult: any = null;
    let modeloUsado = '';
    let ultimoErro = '';

    for (const modelo of MODELOS) {
      // Timeout por modelo: a edge function morre aos 150s e, sem isto, um
      // modelo lento consumia o orçamento todo e os seguintes nem chegavam a
      // ser tentados.
      const controlador = new AbortController();
      const alarme = setTimeout(() => controlador.abort(), 25_000);
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: corpoPedido,
            signal: controlador.signal,
          }
        );

        if (resp.ok) {
          aiResult = await resp.json();
          modeloUsado = modelo;
          break;
        }

        const errText = await resp.text();
        ultimoErro = `${resp.status} ${errText.substring(0, 200)}`;
        console.error(`Gemini ${modelo}:`, ultimoErro);

        // 404 = nome caducado, tenta o seguinte; outro erro é real e repetir
        // dá a mesma resposta.
        if (resp.status !== 404) break;
      } catch (err) {
        ultimoErro = `${modelo}: ${err instanceof Error ? err.message : String(err)}`;
        console.error('Gemini timeout/rede:', ultimoErro);
      } finally {
        clearTimeout(alarme);
      }
    }

    if (!aiResult) {
      return json({ date: null, error: `AI API error (${ultimoErro})` });
    }
    console.log('extract-document-expiry, modelo:', modeloUsado);
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
