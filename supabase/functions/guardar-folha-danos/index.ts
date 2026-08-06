import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GuardarFolhaDanosRequest {
  /** Contrato de renting a que a folha pertence (contrato_anexos.contrato_id). */
  contratoId: string;
  /** PDF em base64 puro (sem prefixo data:...;base64,). */
  pdfBase64: string;
  /** Nome do ficheiro no bucket. */
  filename: string;
  /** Nome legível mostrado no separador "Anexos". */
  nome?: string;
  /** Token de realização — via de autorização do check-in/out no terreno. */
  token?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contratoId, pdfBase64, filename, nome, token }: GuardarFolhaDanosRequest =
      await req.json();

    if (!contratoId || !pdfBase64 || !filename) {
      return json({ error: 'contratoId, pdfBase64 e filename são obrigatórios' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Autorização ─────────────────────────────────────────────────────────
    // Duas vias, ambas decididas no servidor (a função corre com service role,
    // logo nada aqui pode depender só do que o cliente afirma):
    //  1) Token de realização válido para ESTE contrato — quem faz o check-in/
    //     out no terreno tipicamente não tem permissão de renting_contratos.
    //  2) Sessão do próprio chamador — a RLS de contratos_renting é o teste:
    //     se o contrato não lhe é visível, não pode anexar-lhe nada.
    let autorizado = false;

    if (token) {
      const { data: tok } = await admin
        .from('realizacao_tokens')
        .select('contrato_id')
        .eq('id', token)
        .maybeSingle();
      autorizado = !!tok && tok.contrato_id === contratoId;
    }

    if (!autorizado) {
      const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data: visivel } = await caller
        .from('contratos_renting')
        .select('id')
        .eq('id', contratoId)
        .maybeSingle();
      autorizado = !!visivel;
    }

    if (!autorizado) return json({ error: 'Sem acesso a este contrato.' }, 403);

    // org_id explícito (o trigger da tabela também o derivaria do contrato).
    const { data: contrato } = await admin
      .from('contratos_renting')
      .select('id, org_id')
      .eq('id', contratoId)
      .maybeSingle();
    if (!contrato) return json({ error: 'Contrato não encontrado.' }, 404);

    const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    const safeName = filename.replace(/[^\w.\-]/g, '_');
    const path = `${contratoId}/${Date.now()}-${safeName}`;

    const { error: upErr } = await admin.storage
      .from('contrato-anexos')
      .upload(path, new Blob([bytes], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (upErr) throw upErr;

    const { error: insErr } = await admin.from('contrato_anexos').insert({
      contrato_id: contratoId,
      org_id: contrato.org_id,
      nome: (nome?.trim() || filename).slice(0, 255),
      ficheiro_url: path,
      tamanho_bytes: bytes.byteLength,
      mime_type: 'application/pdf',
    });
    if (insErr) {
      // Rollback: sem a linha, o ficheiro no bucket ficaria órfão.
      await admin.storage.from('contrato-anexos').remove([path]);
      throw insErr;
    }

    return json({ success: true, path });
  } catch (error) {
    console.error('Erro guardar-folha-danos:', error);
    return json({ success: false, error: (error as Error).message || 'Erro interno' }, 500);
  }
});
