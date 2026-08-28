// Leitura pública de um pedido de assinatura, pelo token do link.
//
// É a única porta por onde a página /assinar/:token vê alguma coisa: ela nunca
// fala com a base de dados. Aqui valida-se o token com chave de serviço e
// devolve-se apenas o que é preciso para desenhar aquele documento — nunca
// acesso ao contrato, ao cliente ou a seja o que for à volta.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'documentos';
/** Tempo de vida do link de descarga do documento assinado. */
const SEGUNDOS_LINK_ASSINADO = 60 * 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Cópia da regra testada em src/lib/assinaturas.ts.
 *
 * O link NÃO expira e aceita assinaturas repetidas: `assinado` é informação
 * sobre a última, não uma porta fechada. Quem abre o link volta sempre a poder
 * assinar, e vale a última.
 */
function estadoDoToken(pedido: { assinado_em: string | null }): 'valido' | 'assinado' {
  return pedido.assinado_em ? 'assinado' : 'valido';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { token } = (await req.json()) as { token?: string };
    if (!token) return json({ error: 'Token em falta.' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: pedido, error } = await supabase
      .from('documento_assinatura_pedidos')
      .select(
        'id, papel, signatario_nome, documento_nome, snapshot_path, assinado_em, documento_assinado_path, assinaturas_total'
      )
      .eq('id', token)
      .maybeSingle();

    // Um token que não existe e um token inválido são a mesma coisa para quem
    // está do outro lado, e é assim que deve ser: não se confirma a existência
    // de nada a quem adivinha identificadores.
    if (error || !pedido) return json({ error: 'Pedido não encontrado.' }, 404);

    const estado = estadoDoToken(pedido);

    // Quem ja assinou tem direito a rever o que assinou — mas a fotografia vai
    // sempre, porque tambem pode voltar a assinar.
    let urlAssinado: string | null = null;
    if (pedido.documento_assinado_path) {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(pedido.documento_assinado_path, SEGUNDOS_LINK_ASSINADO);
      urlAssinado = data?.signedUrl ?? null;
    }

    // Válido: vai a fotografia, que é o que permite desenhar o documento outra
    // vez no browser de quem assina.
    const { data: ficheiro, error: erroSnap } = await supabase.storage
      .from(BUCKET)
      .download(pedido.snapshot_path);

    if (erroSnap || !ficheiro) {
      console.error('Falha ao ler a fotografia:', erroSnap);
      return json({ error: 'Não foi possível carregar o documento.' }, 500);
    }

    return json({
      estado,
      documentoNome: pedido.documento_nome,
      papel: pedido.papel,
      signatarioNome: pedido.signatario_nome,
      snapshot: JSON.parse(await ficheiro.text()),
      assinadoEm: pedido.assinado_em,
      urlAssinado,
      assinaturasTotal: pedido.assinaturas_total ?? 0,
    });
  } catch (erro) {
    console.error('Erro assinatura-por-token:', erro);
    return json({ error: (erro as Error).message || 'Erro interno' }, 500);
  }
});
