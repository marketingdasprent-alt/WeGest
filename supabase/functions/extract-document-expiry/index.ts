import { createClient } from 'npm:@supabase/supabase-js@2.105.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { filePath, mimeType } = await req.json();
    if (!filePath) {
      return new Response(JSON.stringify({ date: null, error: 'filePath is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return new Response(JSON.stringify({ date: null, error: 'GEMINI_API_KEY not configured' }), {
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    // Download file from storage
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: fileData, error: dlError } = await supabase.storage
      .from('motorista-documentos')
      .download(filePath);

    if (dlError || !fileData) {
      return new Response(JSON.stringify({ date: null, error: dlError?.message }), {
        status: 400,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    // Convert to base64 (chunk to avoid stack overflow)
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64Data = btoa(binary);

    // Determine media type
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const resolvedMime = mimeType ||
      (ext === 'pdf' ? 'application/pdf' :
       ext === 'png' ? 'image/png' :
       'image/jpeg');

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
      return new Response(JSON.stringify({ date: null, error: `AI API error (${geminiResp.status}): ${errText.substring(0, 200)}` }), {
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    const aiResult = await geminiResp.json();
    console.log('Gemini full response:', JSON.stringify(aiResult).substring(0, 500));

    // Verificar erro da API
    if (aiResult.error) {
      console.error('Gemini API error:', aiResult.error);
      return new Response(JSON.stringify({ date: null, debug: `Gemini error: ${aiResult.error.message}` }), {
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
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

    return new Response(JSON.stringify({ date, debug: date ? undefined : `rawText: "${rawText}"` }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('extract-document-expiry error:', err);
    return new Response(JSON.stringify({ date: null, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
