// Envia uma mensagem para a conversa de um pedido de TI. verify_jwt = false:
// quem pediu pode não ter conta. Dois caminhos de autorização:
// - `acesso_token` do pedido (link do email) → fala como quem pediu;
// - sessão → só se a RLS deixar ler o pedido; o lado sai de ladoDaSessao.
// É o único sítio que escreve em ti_ticket_mensagens (ver a migração).
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { RequestBodyError } from '../_shared/http/boundedJson.ts';
import { readBoundedObject } from '../_shared/rate-limit/requestBody.ts';
import {
  consumeRateLimit,
  hashRateLimitIdentity,
  rateLimitResponse,
  trustedRequestIp,
} from '../_shared/rate-limit/rateLimit.ts';
import { validarAnexosSubmissao } from '../_shared/ti-tickets/anexos.ts';
import {
  ladoDaSessao,
  validarTextoMensagem,
  type LadoConversa,
} from '../_shared/ti-tickets/mensagem.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

interface TicketAlvo {
  id: string;
  org_id: string;
  status: string;
  autor_nome: string;
  criado_por: string | null;
}

const COLUNAS_TICKET = 'id, org_id, status, autor_nome, criado_por';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { acesso_token, ticket_id, texto, anexos } = await readBoundedObject(
      req,
      21 * 1024 * 1024
    );

    // Barato primeiro; os anexos só se descodificam depois de autorizar e de
    // gastar quota, para um pedido anónimo não pôr a função a ler base64 de graça.
    const temAnexos = Array.isArray(anexos) && anexos.length > 0;
    const textoValidado = validarTextoMensagem(texto, temAnexos);
    if (!textoValidado.ok) return json({ success: false, error: textoValidado.error }, 400);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(url, serviceKey);

    let ticket: TicketAlvo | null = null;
    let lado: LadoConversa;
    let criadoPor: string | null = null;
    let nome: string;

    if (acesso_token !== undefined && acesso_token !== null) {
      if (typeof acesso_token !== 'string' || !UUID.test(acesso_token)) {
        return json({ success: false, error: 'Link inválido.' }, 400);
      }
      const { data, error } = await sb
        .from('ti_tickets')
        .select(COLUNAS_TICKET)
        .eq('acesso_token', acesso_token)
        .maybeSingle();
      if (error) throw error;
      ticket = data as TicketAlvo | null;
      if (!ticket) return json({ success: false, error: 'Pedido não encontrado.' }, 404);
      lado = 'autor';
      nome = ticket.autor_nome;
    } else {
      if (typeof ticket_id !== 'string' || !UUID.test(ticket_id)) {
        return json({ success: false, error: 'Pedido não indicado.' }, 400);
      }
      const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
      const { data: sessao } = jwt ? await sb.auth.getUser(jwt) : { data: null };
      const uid = sessao?.user?.id;
      if (!uid) return json({ success: false, error: 'Sessão expirada. Entre de novo.' }, 401);

      // Lido com a sessão de quem escreve, não com a service role: quem pode
      // falar num pedido é exactamente quem a RLS deixa vê-lo.
      const comoUtilizador = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false },
      });
      const { data, error } = await comoUtilizador
        .from('ti_tickets')
        .select(COLUNAS_TICKET)
        .eq('id', ticket_id)
        .maybeSingle();
      if (error) throw error;
      ticket = data as TicketAlvo | null;
      if (!ticket) return json({ success: false, error: 'Pedido não encontrado.' }, 404);

      lado = ladoDaSessao(ticket.criado_por, uid);
      // Ver o pedido não chega para responder como suporte: é preciso poder
      // editar, a mesma regra que mostra o painel de gestão na app.
      if (lado === 'suporte') {
        const { data: podeEditar, error: erroPermissao } = await comoUtilizador.rpc('can_edit', {
          _user_id: uid,
          _recurso: 'ti_tickets_gerir',
        });
        if (erroPermissao) throw erroPermissao;
        if (!podeEditar) {
          return json({ success: false, error: 'Sem permissão para responder a pedidos.' }, 403);
        }
      }
      criadoPor = uid;
      const { data: perfil } = await sb.from('profiles').select('nome').eq('id', uid).maybeSingle();
      nome =
        (perfil as { nome?: string | null } | null)?.nome?.trim() ||
        (lado === 'autor' ? ticket.autor_nome : 'Suporte');
    }

    if (ticket.status === 'resolvido') {
      return json({ success: false, error: 'Este pedido está resolvido.' }, 409);
    }

    const origem = await hashRateLimitIdentity(trustedRequestIp(req), serviceKey);
    const quotas = [
      {
        operation: 'ti-ticket-mensagem',
        identity: `${ticket.id}:${criadoPor ?? origem}`,
        limit: 60,
        windowSeconds: 3600,
      },
      // Tecto do pedido inteiro: o link anónimo não se resolve com trocar de IP.
      {
        operation: 'ti-ticket-mensagem-pedido',
        identity: ticket.id,
        limit: 200,
        windowSeconds: 3600,
      },
    ];
    // Cada ficheiro gasta da quota de anexos do pedido: as mensagens sozinhas
    // deixavam passar 3 × 5 MB por mensagem.
    const nAnexos = Array.isArray(anexos) ? Math.min(anexos.length, 3) : 0;
    for (let i = 0; i < nAnexos; i++) {
      quotas.push({
        operation: 'ti-ticket-mensagem-anexos',
        identity: ticket.id,
        limit: 30,
        windowSeconds: 3600,
      });
    }
    for (const quota of quotas) {
      const limitada = rateLimitResponse(await consumeRateLimit(sb, quota), cors);
      if (limitada) return limitada;
    }

    const anexosValidados = validarAnexosSubmissao(anexos);
    if (!anexosValidados.ok) return json({ success: false, error: anexosValidados.error }, 400);

    const { data: mensagem, error: erroMensagem } = await sb
      .from('ti_ticket_mensagens')
      .insert({
        org_id: ticket.org_id,
        ticket_id: ticket.id,
        autor_tipo: lado,
        criado_por: criadoPor,
        criado_por_nome: nome,
        texto: textoValidado.texto,
      })
      .select('id')
      .single();
    if (erroMensagem) throw erroMensagem;

    // Melhor esforço, como na submissão: a mensagem já está gravada e não se
    // devolve erro por um ficheiro que falhou.
    let anexosFalhou = false;
    let gravados = 0;
    for (const anexo of anexosValidados.data) {
      const nomeSeguro = anexo.nome.replace(/[^\w.\-]/g, '_');
      const caminho = `${ticket.id}/${mensagem.id}/${Date.now()}-${nomeSeguro}`;

      const { error: uploadError } = await sb.storage
        .from('ti-ticket-anexos')
        .upload(caminho, anexo.bytes, { contentType: anexo.mimeType, upsert: false });
      if (uploadError) {
        console.error('ti-ticket-mensagem: falha a carregar anexo:', uploadError);
        anexosFalhou = true;
        continue;
      }

      const { error: anexoError } = await sb.from('ti_ticket_anexos').insert({
        org_id: ticket.org_id,
        ticket_id: ticket.id,
        mensagem_id: mensagem.id,
        nome: anexo.nome,
        ficheiro_url: caminho,
        tamanho_bytes: anexo.bytes.byteLength,
        mime_type: anexo.mimeType,
        criado_por: criadoPor,
        criado_por_nome: nome,
      });
      if (anexoError) {
        console.error('ti-ticket-mensagem: falha a gravar anexo:', anexoError);
        anexosFalhou = true;
        await sb.storage.from('ti-ticket-anexos').remove([caminho]);
        continue;
      }
      gravados++;
    }

    // Uma mensagem só de anexos em que nenhum gravou seria uma bolha vazia.
    if (!textoValidado.texto && gravados === 0) {
      await sb.from('ti_ticket_mensagens').delete().eq('id', mensagem.id);
      return json({ success: false, error: 'Não foi possível guardar os anexos.' }, 500);
    }

    // A caixa de entrada ordena por actividade.
    const { error: erroTicket } = await sb
      .from('ti_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', ticket.id);
    if (erroTicket) console.error('ti-ticket-mensagem: updated_at não actualizou:', erroTicket);

    return json({ success: true, mensagem_id: mensagem.id, anexosFalhou });
  } catch (e) {
    if (e instanceof RequestBodyError) return json({ success: false, error: e.message }, e.status);
    console.error('ti-ticket-mensagem:', e);
    return json({ success: false, error: 'Não foi possível enviar a mensagem.' }, 500);
  }
});
