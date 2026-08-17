// Submissão pública de tickets de TI. verify_jwt = false: quem submete pode não
// ter conta nenhuma. A autorização é o token do link, validado aqui dentro; as
// tabelas continuam fechadas por RLS a quem tem sessão.
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

/** Valida um email simples: algo@algo.algo (algo antes de @, algo depois, e um ponto no domínio). */
function isValidEmail(email: string): boolean {
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;
  return domain.includes('.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { token, nome, email, descricao } = await req.json();

    if (!token) return json({ success: false, error: 'Link inválido.' }, 400);
    if (typeof nome !== 'string' || !nome.trim())
      return json({ success: false, error: 'Indique o seu nome.' }, 400);
    if (typeof email !== 'string' || !isValidEmail(email))
      return json({ success: false, error: 'Indique um email válido.' }, 400);
    if (typeof descricao !== 'string' || !descricao.trim())
      return json({ success: false, error: 'Descreva o problema.' }, 400);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // O token resolve a organização. Desativado = link rodado, já não serve.
    const { data: linha, error: tokenError } = await sb
      .from('ti_tokens')
      .select('org_id')
      .eq('token', token)
      .eq('ativo', true)
      .maybeSingle();

    // Uma falha da base de dados NÃO é um link inválido. Sem esta distinção, um
    // problema de infraestrutura aparecia ao utilizador como "o teu link não
    // serve" — foi exactamente o que se viu no primeiro teste em produção, com
    // a tabela ainda por criar: devolvia 403 em vez de sinalizar a avaria.
    if (tokenError) {
      console.error('ti-ticket-submeter: falha a ler ti_tokens:', tokenError);
      return json({ success: false, error: 'Serviço indisponível. Tente mais tarde.' }, 503);
    }

    if (!linha) return json({ success: false, error: 'Este link já não é válido.' }, 403);

    // Limite por origem. Um endpoint anónimo de escrita e uma porta aberta, e o
    // token circula por email e WhatsApp. Prioridade de confiança: cf-connecting-ip
    // (sobreposto pelo proxy Cloudflare/Supabase) antes de x-forwarded-for (cliente
    // pode falsificar o primeiro valor). Se x-forwarded-for, usa o ÚLTIMO, não o
    // primeiro: o gateway acrescenta o IP verdadeiro no fim da lista.
    const cfConnectingIp = req.headers.get('cf-connecting-ip');
    const xForwardedFor = req.headers.get('x-forwarded-for');
    const ip =
      cfConnectingIp ??
      (xForwardedFor ? xForwardedFor.split(',').pop()?.trim() : undefined) ??
      'desconhecido';
    const origem = await hashOrigem(ip);
    const desde = new Date(Date.now() - 3_600_000).toISOString();

    const { count, error: countError } = await sb
      .from('ti_submissoes')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', linha.org_id)
      .eq('origem_hash', origem)
      .gte('created_at', desde);

    if (countError) {
      console.error('Erro ao contar submissões:', countError);
      return json({ success: false, error: 'Não foi possível verificar o limite.' }, 429);
    }

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

    const { error: submissaoError } = await sb
      .from('ti_submissoes')
      .insert({ org_id: linha.org_id, origem_hash: origem });

    if (submissaoError) {
      console.error('Erro ao registar submissão (ticket já criado):', submissaoError);
    }

    return json({ success: true, numero: ticket.numero });
  } catch (e) {
    console.error('ti-ticket-submeter:', e);
    return json({ success: false, error: 'Não foi possível registar o pedido.' }, 500);
  }
});
