// Submissão pública de tickets de TI. verify_jwt = false: quem submete pode não
// ter conta nenhuma. A autorização é o token do link, validado aqui dentro; as
// tabelas continuam fechadas por RLS a quem tem sessão.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validarAnexosSubmissao } from '../_shared/ti-tickets/anexos.ts';

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
    const { token, nome, email, descricao, anexos } = await req.json();

    if (!token) return json({ success: false, error: 'Link inválido.' }, 400);
    if (typeof nome !== 'string' || !nome.trim())
      return json({ success: false, error: 'Indique o seu nome.' }, 400);
    if (typeof email !== 'string' || !isValidEmail(email))
      return json({ success: false, error: 'Indique um email válido.' }, 400);
    if (typeof descricao !== 'string' || !descricao.trim())
      return json({ success: false, error: 'Descreva o problema.' }, 400);

    // Validado ANTES de tocar na base de dados: um anexo mal formado não deve
    // criar um ticket órfão de anexo.
    const anexosValidados = validarAnexosSubmissao(anexos);
    if (!anexosValidados.ok) return json({ success: false, error: anexosValidados.error }, 400);

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
      .select('id, numero')
      .single();

    if (error) throw error;

    // Melhor esforço: os anexos nunca fazem falhar a submissão — o pedido já
    // está gravado e a pessoa já tem o número. Falhar aqui devolvia "não foi
    // possível registar o pedido" para algo que, na verdade, já registou.
    let anexosFalhou = false;
    for (const anexo of anexosValidados.data) {
      const nomeSeguro = anexo.nome.replace(/[^\w.\-]/g, '_');
      const caminho = `${ticket.id}/${Date.now()}-${nomeSeguro}`;

      const { error: uploadError } = await sb.storage
        .from('ti-ticket-anexos')
        .upload(caminho, anexo.bytes, { contentType: anexo.mimeType, upsert: false });
      if (uploadError) {
        console.error('ti-ticket-submeter: falha a carregar anexo:', uploadError);
        anexosFalhou = true;
        continue;
      }

      const { error: anexoError } = await sb.from('ti_ticket_anexos').insert({
        org_id: linha.org_id,
        ticket_id: ticket.id,
        nome: anexo.nome,
        ficheiro_url: caminho,
        tamanho_bytes: anexo.bytes.byteLength,
        mime_type: anexo.mimeType,
        criado_por_nome: nome.trim(),
      });
      if (anexoError) {
        console.error('ti-ticket-submeter: falha a gravar anexo:', anexoError);
        anexosFalhou = true;
        await sb.storage.from('ti-ticket-anexos').remove([caminho]);
      }
    }

    const { error: submissaoError } = await sb
      .from('ti_submissoes')
      .insert({ org_id: linha.org_id, origem_hash: origem });

    if (submissaoError) {
      console.error('Erro ao registar submissão (ticket já criado):', submissaoError);
    }

    // Aviso ao suporte. É o último passo e nunca faz falhar a submissão: o
    // pedido já está gravado e quem o submeteu já tem direito ao número. Dizer
    // "não foi possível registar o pedido" porque o email não saiu mandava a
    // pessoa submeter outra vez e duplicava o ticket.
    // O invoke devolve o erro em `error` em vez de o lançar — sem verificar o
    // valor devolvido, uma falha do aviso passava calada; o try/catch fica na
    // mesma para o que rebenta antes de haver resposta.
    try {
      const { error: emailError } = await sb.functions.invoke('ti-ticket-novo-email', {
        body: { ticket_id: ticket.id },
      });
      if (emailError) {
        console.error('ti-ticket-submeter: aviso ao suporte não saiu:', emailError);
      }
    } catch (emailError) {
      console.error('ti-ticket-submeter: aviso ao suporte não saiu:', emailError);
    }

    return json({ success: true, numero: ticket.numero, anexosFalhou });
  } catch (e) {
    console.error('ti-ticket-submeter:', e);
    return json({ success: false, error: 'Não foi possível registar o pedido.' }, 500);
  }
});
