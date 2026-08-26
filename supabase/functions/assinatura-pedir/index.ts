// Pedir assinatura de um documento.
//
// Guarda o PDF tal como foi enviado e a fotografia dos dados que o produziram,
// cria um pedido por signatário e manda a cada um o documento em anexo com o
// link onde assina.
//
// Regra que atravessa esta função: um email que falha NÃO desfaz o pedido. O
// pedido fica criado e reenvia-se — devolve-se a lista de quem não recebeu.
// Desfazer o trabalho de quem carregou no botão por causa de um email é o
// oposto do que se quer.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EmailService } from '../_shared/email/services/EmailService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'documentos';
const VALIDADE_DIAS_OMISSAO = 30;

type Papel = 'cliente' | 'condutor' | 'motorista';

interface SignatarioPedido {
  papel: Papel;
  nome: string;
  email: string;
  clienteId?: string | null;
  motoristaId?: string | null;
}

interface PedirAssinaturaRequest {
  orgId: string;
  contratoId?: string | null;
  templateId?: string | null;
  documentoNome: string;
  /** PDF em base64 puro, sem o prefixo data:...;base64, */
  pdfBase64: string;
  /** A fotografia dos dados que produziram o documento. */
  snapshot: unknown;
  signatarios: SignatarioPedido[];
  validadeDias?: number;
  criadoPor?: string | null;
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
    const corpo: PedirAssinaturaRequest = await req.json();
    const { orgId, documentoNome, pdfBase64, snapshot, signatarios } = corpo;

    if (!orgId || !documentoNome || !pdfBase64 || !snapshot) {
      return json({ error: 'orgId, documentoNome, pdfBase64 e snapshot são obrigatórios' }, 400);
    }

    // A mesma regra do ecrã, repetida aqui por defesa. A versão testada vive em
    // src/lib/assinaturas.ts — o vitest.config.ts exclui supabase/**, por isso
    // um teste colocado aqui nunca correria.
    if (!Array.isArray(signatarios) || signatarios.length === 0) {
      return json({ error: 'Indique pelo menos uma pessoa para assinar' }, 400);
    }
    const semEmail = signatarios
      .filter((s) => !s.email || s.email.trim() === '')
      .map((s) => s.nome);
    if (semEmail.length > 0) {
      return json({ error: 'Há pessoas sem email na ficha', semEmail }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const validadeDias = corpo.validadeDias ?? VALIDADE_DIAS_OMISSAO;
    const expiresAt = new Date(Date.now() + validadeDias * 86_400_000);
    const carimbo = `${orgId}/${Date.now()}`;

    // 1. O documento tal como vai ser enviado, e a fotografia ao lado dele.
    const documentoPath = `assinaturas/${carimbo}/documento.pdf`;
    const { error: erroPdf } = await supabase.storage
      .from(BUCKET)
      .upload(documentoPath, base64ParaBytes(pdfBase64), {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (erroPdf) throw new Error(`Falha ao guardar o documento: ${erroPdf.message}`);

    const snapshotPath = `assinaturas/${carimbo}/fotografia.json`;
    const { error: erroSnap } = await supabase.storage
      .from(BUCKET)
      .upload(snapshotPath, new TextEncoder().encode(JSON.stringify(snapshot)), {
        contentType: 'application/json',
        upsert: false,
      });
    if (erroSnap) throw new Error(`Falha ao guardar a fotografia: ${erroSnap.message}`);

    // 2. Um pedido por pessoa. Sem estado agregado: cada um vive por si.
    const { data: pedidos, error: erroInsert } = await supabase
      .from('documento_assinatura_pedidos')
      .insert(
        signatarios.map((s) => ({
          org_id: orgId,
          contrato_id: corpo.contratoId ?? null,
          template_id: corpo.templateId ?? null,
          papel: s.papel,
          signatario_nome: s.nome,
          signatario_email: s.email.trim(),
          cliente_id: s.clienteId ?? null,
          motorista_id: s.motoristaId ?? null,
          documento_nome: documentoNome,
          documento_path: documentoPath,
          snapshot_path: snapshotPath,
          expires_at: expiresAt.toISOString(),
          created_by: corpo.criadoPor ?? null,
        }))
      )
      .select('id, signatario_nome, signatario_email');

    if (erroInsert) throw new Error(`Falha ao criar os pedidos: ${erroInsert.message}`);

    // 3. Os emails. A partir daqui nada desfaz o que já está criado.
    const emailService = new EmailService(supabase);
    const validoAte = expiresAt.toLocaleDateString('pt-PT');
    const falharam: string[] = [];

    for (const pedido of pedidos ?? []) {
      try {
        const resultado = await emailService.sendPedidoAssinatura(orgId, {
          to: pedido.signatario_email,
          destinatarioNome: pedido.signatario_nome,
          documentoNome,
          ctaUrl: `https://wegest.pt/assinar/${pedido.id}`,
          validoAte,
          pdfBase64,
          filename: `${documentoNome}.pdf`,
        });
        if (!resultado.success) falharam.push(pedido.signatario_nome);
      } catch (erro) {
        console.error('Falha ao enviar pedido de assinatura:', erro);
        falharam.push(pedido.signatario_nome);
      }
    }

    return json({
      success: true,
      pedidos: (pedidos ?? []).map((p) => ({ id: p.id, nome: p.signatario_nome })),
      falharam,
    });
  } catch (erro) {
    console.error('Erro assinatura-pedir:', erro);
    return json({ success: false, error: (erro as Error).message || 'Erro interno' }, 500);
  }
});
