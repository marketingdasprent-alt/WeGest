import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type Bucket = 'viatura-documentos' | 'assistencia-anexos' | 'viatura-danos';

const extractPath = (urlOrPath: string): string => {
  if (!urlOrPath.startsWith('http')) return urlOrPath;
  const m = urlOrPath.match(
    /\/storage\/v1\/object\/(?:public|sign)\/(?:viatura-documentos|assistencia-anexos|viatura-danos)\/([^?]+)/
  );
  return m ? decodeURIComponent(m[1]) : urlOrPath;
};
const detectBucket = (urlOrPath: string): Bucket => {
  if (urlOrPath.startsWith('assistencia/') || urlOrPath.includes('assistencia-anexos'))
    return 'assistencia-anexos';
  if (urlOrPath.includes('viatura-danos')) return 'viatura-danos';
  if (!urlOrPath.startsWith('http')) return 'viatura-danos';
  return 'viatura-documentos';
};

// Galeria pública de danos de uma viatura, acedida por token (sem login).
// O bucket mantém-se PRIVADO; aqui geram-se signed URLs temporárias.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { token } = (await req.json()) as { token?: string };
    if (!token) return json({ error: 'Token em falta.' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1) Validar token → viatura.
    const { data: tok } = await supabase
      .from('danos_tokens')
      .select('viatura_id, expires_at')
      .eq('id', token)
      .maybeSingle();
    if (!tok) return json({ error: 'Token inválido.' }, 404);
    if (new Date(tok.expires_at as string) < new Date())
      return json({ error: 'Token expirado.' }, 410);

    const viaturaId = tok.viatura_id as string;

    // 2) Matrícula da viatura.
    const { data: via } = await supabase
      .from('viaturas')
      .select('matricula')
      .eq('id', viaturaId)
      .maybeSingle();

    // 3) Danos activos + fotos.
    const { data: danos } = await supabase
      .from('viatura_danos')
      .select('id, localizacao, descricao, estado, data_registo, data_ocorrencia, valor')
      .eq('viatura_id', viaturaId)
      .not('estado', 'eq', 'reparado')
      .order('created_at', { ascending: false });

    const danoIds = (danos ?? []).map((d: { id: string }) => d.id);
    const { data: fotos } = danoIds.length
      ? await supabase
          .from('viatura_dano_fotos')
          .select('dano_id, ficheiro_url')
          .in('dano_id', danoIds)
          .order('created_at', { ascending: false })
      : { data: [] as { dano_id: string; ficheiro_url: string }[] };

    // 4) Signed URLs (validade 7 dias) por bucket.
    const raws = (fotos ?? [])
      .map((f: { ficheiro_url: string }) => f.ficheiro_url)
      .filter((u: string) => !!u);
    const byBucket: Record<string, string[]> = {
      'viatura-documentos': [],
      'assistencia-anexos': [],
      'viatura-danos': [],
    };
    for (const raw of raws) byBucket[detectBucket(raw)].push(extractPath(raw));

    const signedByPath = new Map<string, string>();
    for (const [bucket, paths] of Object.entries(byBucket)) {
      if (!paths.length) continue;
      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, 60 * 60 * 24 * 7);
      (signed ?? []).forEach((s: { signedUrl?: string; path?: string }) => {
        if (s.signedUrl && s.path) signedByPath.set(s.path, s.signedUrl);
      });
    }
    const urls = raws
      .map((raw: string) => signedByPath.get(extractPath(raw)) ?? (raw.startsWith('http') ? raw : null))
      .filter((u: string | null): u is string => !!u);

    return json({ matricula: via?.matricula ?? '', danos: danos ?? [], fotos: urls }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado.' }, 500);
  }
});
