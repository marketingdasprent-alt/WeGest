// Submissao publica de tickets de TI. verify_jwt = false: quem submete pode nao
// ter conta nenhuma. A autorizacao e o token do link, validado aqui dentro; as
// tabelas continuam fechadas por RLS a quem tem sessao.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
};

const LIMITE_POR_HORA = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Hash da origem com um segredo do projecto: conta o limite sem guardar o IP. */
async function hashOrigem(ip: string): Promise<string> {
  const segredo = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const dados = new TextEncoder().encode(`${segredo}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { token, nome, email, descricao } = await req.json();

    if (!token) return json({ success: false, error: 'Link inválido.' }, 400);
    if (!nome?.trim()) return json({ success: false, error: 'Indique o seu nome.' }, 400);
    if (!email?.includes('@'))
      return json({ success: false, error: 'Indique um email válido.' }, 400);
    if (!descricao?.trim()) return json({ success: false, error: 'Descreva o problema.' }, 400);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // O token resolve a organizacao. Desativado = link rodado, ja nao serve.
    const { data: linha } = await sb
      .from('ti_tokens')
      .select('org_id')
      .eq('token', token)
      .eq('ativo', true)
      .maybeSingle();

    if (!linha) return json({ success: false, error: 'Este link já não é válido.' }, 403);

    // Limite por origem. Um endpoint anonimo de escrita e uma porta aberta, e o
    // token circula por email e WhatsApp.
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('cf-connecting-ip') ??
      'desconhecido';
    const origem = await hashOrigem(ip);
    const desde = new Date(Date.now() - 3_600_000).toISOString();

    const { count } = await sb
      .from('ti_submissoes')
      .select('id', { count: 'exact', head: true })
      .eq('origem_hash', origem)
      .gte('created_at', desde);

    if ((count ?? 0) >= LIMITE_POR_HORA) {
      return json({ success: false, error: 'Demasiados pedidos. Tente dentro de uma hora.' }, 429);
    }

    const { data: ticket, error } = await sb
      .from('ti_tickets')
      .insert({
        org_id: linha.org_id,
        autor_nome: nome.trim(),
        autor_email: email.trim().toLowerCase(),
        descricao: descricao.trim(),
      })
      .select('numero')
      .single();

    if (error) throw error;

    await sb.from('ti_submissoes').insert({ org_id: linha.org_id, origem_hash: origem });

    return json({ success: true, numero: ticket.numero });
  } catch (e) {
    console.error('ti-ticket-submeter:', e);
    return json({ success: false, error: 'Não foi possível registar o pedido.' }, 500);
  }
});
