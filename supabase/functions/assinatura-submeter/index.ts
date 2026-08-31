// Recebe a assinatura e o documento assinado.
//
// A ordem das operações é o que interessa aqui, e não é negociável: guarda-se
// primeiro, marca-se depois. Se alguma subida falhar, nada fica marcado e o
// link continua a funcionar — a pessoa volta a tentar. Nunca pode existir um
// pedido com `assinado_em` preenchido e sem documento assinado: isso seria uma
// assinatura que a aplicação diz existir e não consegue mostrar.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EmailService } from '../_shared/email/services/EmailService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'documentos';

interface SubmeterRequest {
  token: string;
  /** PNG da assinatura, base64 puro. */
  assinaturaBase64: string;
  /** PDF já com a assinatura desenhada, base64 puro. */
  documentoAssinadoBase64: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { token, assinaturaBase64, documentoAssinadoBase64 } =
      (await req.json()) as SubmeterRequest;

    if (!token || !assinaturaBase64 || !documentoAssinadoBase64) {
      return json({ error: 'token, assinaturaBase64 e documentoAssinadoBase64 são obrigatórios' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: pedido, error } = await supabase
      .from('documento_assinatura_pedidos')
      .select(
        'id, org_id, signatario_nome, signatario_email, documento_nome, assinado_em, created_by'
      )
      .eq('id', token)
      .maybeSingle();

    if (error || !pedido) return json({ error: 'Pedido não encontrado.' }, 404);

    // O link é de UMA utilização. Não há prazo a verificar — o tempo não o
    // fecha — mas uma assinatura fecha-o. Para assinar outra vez, quem trata
    // do contrato envia um pedido novo, com link novo.
    if (pedido.assinado_em) {
      return json(
        { error: 'Este link já foi usado. Peça um novo pedido de assinatura.', estado: 'assinado' },
        409
      );
    }

    // 1. Guardar. Só depois de os dois ficheiros estarem no sítio é que se
    //    marca o pedido como assinado.
    const pasta = `assinaturas/assinados/${pedido.id}`;

    const assinaturaPath = `${pasta}/assinatura.png`;
    const { error: erroAssinatura } = await supabase.storage
      .from(BUCKET)
      .upload(assinaturaPath, base64ParaBytes(assinaturaBase64), {
        contentType: 'image/png',
        upsert: true,
      });
    if (erroAssinatura) throw new Error(`Falha ao guardar a assinatura: ${erroAssinatura.message}`);

    const documentoPath = `${pasta}/documento-assinado.pdf`;
    const { error: erroDocumento } = await supabase.storage
      .from(BUCKET)
      .upload(documentoPath, base64ParaBytes(documentoAssinadoBase64), {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (erroDocumento) throw new Error(`Falha ao guardar o documento: ${erroDocumento.message}`);

    // 2. Agora sim, a prova.
    const assinadoEm = new Date();
    const { error: erroUpdate } = await supabase
      .from('documento_assinatura_pedidos')
      .update({
        assinado_em: assinadoEm.toISOString(),
        assinatura_path: assinaturaPath,
        documento_assinado_path: documentoPath,
        assinado_ip:
          req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          req.headers.get('cf-connecting-ip'),
        assinado_user_agent: req.headers.get('user-agent'),
      })
      .eq('id', pedido.id)
      // Compare-and-swap: duas submissões ao mesmo tempo (duplo clique, retry)
      // e só uma escreve. A outra não encontra linha por assinar e a guarda
      // acima já lhe respondeu — a prova da primeira nunca é sobreposta.
      .is('assinado_em', null);

    if (erroUpdate) throw new Error(`Falha ao registar a assinatura: ${erroUpdate.message}`);

    // 3. O documento assinado para as duas partes. A partir daqui, um email que
    //    falhe não desfaz nada — a assinatura está guardada e provada.
    const emailService = new EmailService(supabase);
    const dataLegivel = assinadoEm.toLocaleDateString('pt-PT');
    const filename = `${pedido.documento_nome} (assinado).pdf`;

    const destinatarios: Array<{ email: string; nome: string }> = [
      { email: pedido.signatario_email, nome: pedido.signatario_nome },
    ];

    if (pedido.created_by) {
      const { data: quemEnviou } = await supabase
        .from('profiles')
        .select('nome, email')
        .eq('id', pedido.created_by)
        .maybeSingle();

      if (quemEnviou?.email) {
        destinatarios.push({ email: quemEnviou.email, nome: quemEnviou.nome ?? 'Colega' });
      }
    }

    for (const destinatario of destinatarios) {
      try {
        await emailService.sendDocumentoAssinado(pedido.org_id, {
          to: destinatario.email,
          destinatarioNome: destinatario.nome,
          documentoNome: pedido.documento_nome,
          signatarioNome: pedido.signatario_nome,
          assinadoEm: dataLegivel,
          pdfBase64: documentoAssinadoBase64,
          filename,
        });
      } catch (erro) {
        // O documento está guardado: um email falhado não pode fazer a pessoa
        // pensar que a assinatura se perdeu.
        console.error('Falha ao enviar o documento assinado:', erro);
      }
    }

    return json({ success: true, assinadoEm: assinadoEm.toISOString() });
  } catch (erro) {
    console.error('Erro assinatura-submeter:', erro);
    return json({ success: false, error: (erro as Error).message || 'Erro interno' }, 500);
  }
});
