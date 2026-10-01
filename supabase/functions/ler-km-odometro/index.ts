// ler-km-odometro — lê os quilómetros na fotografia de um painel de instrumentos.
//
// O motorista fotografa o odómetro no portal; esta função devolve o número
// para ele confirmar ou corrigir. Quem decide é sempre ele: isto poupa-lhe
// escrever, não substitui a confirmação.
//
// Mesmo padrão da extract-document-expiry (Gemini Flash, ficheiro vindo do
// storage, temperature 0), com um prompt próprio — ler um odómetro tem
// armadilhas que ler uma data não tem, e estão listadas no prompt.

import { createClient } from 'npm:@supabase/supabase-js@2.105.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

// Os nomes dos modelos do Gemini caducam sem aviso: o `gemini-2.0-flash` que
// estas funções usavam passou a devolver 404 (modelo inexistente), e a leitura
// deixou de funcionar em silêncio — a função devolvia "não consegui ler" como
// se a fotografia é que fosse má.
//
// Por isso tenta-se uma lista por ordem e fica-se pelo primeiro que responde.
// Um 404 é "este nome já não existe" e passa-se ao seguinte; qualquer outro
// erro (chave inválida, quota) é real e interrompe — não vale a pena martelar
// a API mais quatro vezes pela mesma resposta.
// Em 09/2026 a família 2.x deixou de estar disponível para novos utilizadores
// ("no longer available to new users"), e era o `gemini-2.0-flash` que estas
// funções pediam. Daí a ordem: o que a própria API indicou como substituto
// primeiro, e os nomes `-latest` no fim, que não caducam mas podem apontar
// para modelos mais caros.
const MODELOS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { filePath, mimeType } = await req.json();
    if (!filePath) return json({ km: null, error: 'filePath é obrigatório' }, 400);

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) return json({ km: null, error: 'GEMINI_API_KEY não configurada' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: fileData, error: dlError } = await supabase.storage
      .from('viatura-km')
      .download(filePath);
    if (dlError || !fileData) return json({ km: null, error: dlError?.message ?? 'ficheiro não encontrado' }, 400);

    // Base64 por pedaços — de uma vez rebenta a pilha em fotos grandes.
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64Data = btoa(binary);

    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const resolvedMime =
      mimeType || (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');

    const corpoPedido = JSON.stringify({
      contents: [
            {
              parts: [
                { inline_data: { mime_type: resolvedMime, data: base64Data } },
                {
                  text: `Esta é a fotografia do painel de instrumentos de um automóvel. Lê o TOTALIZADOR DE QUILÓMETROS (odómetro total).

REGRAS:
- O odómetro total é o contador MAIOR, o da quilometragem acumulada do carro.
- IGNORA o parcial / trip (ODO A, ODO B, TRIP A, TRIP B) — é sempre um número mais pequeno e costuma ter casas decimais.
- IGNORA a velocidade, as rotações, a temperatura, a hora, a autonomia e o nível de combustível.
- IGNORA qualquer número com vírgula ou ponto decimal: o odómetro total é inteiro.
- Devolve SÓ os dígitos, sem espaços, sem pontos, sem "km". Exemplo: 147829
- Se não conseguires ler o odómetro com certeza, responde apenas: null`,
                },
              ],
            },
      ],
      generationConfig: {
        // Folga grande para um número de 6 dígitos, de propósito: estes
        // modelos pensam antes de responder e o raciocínio conta para o
        // limite. Com 20 tokens gastavam-no todo a pensar e devolviam vazio.
        // `thinkingConfig` não serve para o travar — os modelos 3.x recusam-no
        // com 400 INVALID_ARGUMENT.
        maxOutputTokens: 512,
        temperature: 0,
      },
    });

    let aiResult: Record<string, unknown> | null = null;
    let modeloUsado = '';
    let ultimoErro = '';

    for (const modelo of MODELOS) {
      // Timeout por modelo. A edge function morre aos 150s e, sem isto, um
      // modelo lento consumia o orçamento todo e os seguintes nem chegavam a
      // ser tentados — o motorista ficava à espera e não recebia nada.
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

        // 404 = nome de modelo caducado; qualquer outro erro é real e repetir
        // com outro modelo dá a mesma resposta.
        if (resp.status !== 404) break;
      } catch (err) {
        ultimoErro = `${modelo}: ${err instanceof Error ? err.message : String(err)}`;
        console.error('Gemini timeout/rede:', ultimoErro);
      } finally {
        clearTimeout(alarme);
      }
    }

    if (!aiResult) {
      return json({ km: null, error: `Erro da API de leitura (${ultimoErro})` });
    }
    console.log('ler-km-odometro, modelo:', modeloUsado);

    if (aiResult.error) {
      console.error('Gemini API error:', aiResult.error);
      return json({ km: null, error: 'Não foi possível ler a imagem.' });
    }

    const candidatos = (aiResult as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
    const rawText = (candidatos?.[0]?.content?.parts?.[0]?.text ?? '').trim();
    console.log('ler-km-odometro, resposta:', rawText);

    // Só dígitos. O modelo às vezes devolve "147 829 km" apesar do prompt.
    const digits = rawText.replace(/[^\d]/g, '');
    if (!digits) return json({ km: null });

    const km = Number(digits);

    // Um odómetro acima de 2 000 000 km não existe: é leitura de outra coisa
    // (matrícula, hora, rotações). Mais vale devolver nada e deixar escrever à
    // mão do que propor um número absurdo que alguém confirma por distração.
    if (!Number.isFinite(km) || km <= 0 || km > 2_000_000) return json({ km: null });

    return json({ km });
  } catch (error) {
    console.error('ler-km-odometro:', error);
    return json({ km: null, error: 'Erro inesperado ao ler a imagem.' });
  }
});
