// Resolve um código curto e reencaminha para o ficheiro.
//
// verify_jwt = false: quem abre o link é o motorista no WhatsApp, sem sessão
// na aplicação. A credencial é o próprio código — 12 caracteres aleatórios,
// com validade gravada na linha — e é por isso que nada aqui aceita um caminho
// vindo do pedido: o destino sai sempre da tabela.
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
};

/** Segundos que o URL assinado final dura. Curto de propósito: é só o tempo de
 *  o browser seguir o redireccionamento. A validade que conta é a do código. */
const VALIDADE_ASSINATURA_SEGUNDOS = 120;

function paginaDeErro(mensagem: string, status: number): Response {
  // Quem clica é um motorista, não um programador: mostra-se uma página, não
  // um JSON. Sem detalhes do que existe do outro lado.
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Link indisponível</title>
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;
align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;padding:24px}
div{max-width:28rem;text-align:center}h1{font-size:1.1rem;margin:0 0 .5rem}
p{margin:0;color:#94a3b8;font-size:.9rem}</style></head>
<body><div><h1>${mensagem}</h1><p>Peça um resumo novo a quem lho enviou.</p></div></body></html>`;
  return new Response(html, {
    status,
    headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  // Aceita /link-curto/<codigo> e ?c=<codigo>.
  const url = new URL(req.url);
  const codigo = url.searchParams.get('c') ?? url.pathname.split('/').filter(Boolean).pop() ?? '';

  if (!/^[A-Za-z0-9]{8,32}$/.test(codigo)) {
    return paginaDeErro('Link inválido.', 400);
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: link, error } = await sb
    .from('links_curtos')
    .select('bucket, caminho, expira_em, aberturas')
    .eq('codigo', codigo)
    .maybeSingle();

  if (error) {
    console.error('link-curto: falha a ler o código', error);
    return paginaDeErro('Não foi possível abrir o link.', 500);
  }
  // Mesma resposta para inexistente e expirado: não vale a pena dizer a quem
  // adivinha códigos quais é que já existiram.
  if (!link || new Date(link.expira_em).getTime() <= Date.now()) {
    return paginaDeErro('Este link expirou.', 404);
  }

  const { data: assinado, error: erroAssinatura } = await sb.storage
    .from(link.bucket)
    .createSignedUrl(link.caminho, VALIDADE_ASSINATURA_SEGUNDOS);

  if (erroAssinatura || !assinado?.signedUrl) {
    console.error('link-curto: falha a assinar', erroAssinatura);
    return paginaDeErro('Não foi possível abrir o ficheiro.', 500);
  }

  // Contabilidade do acesso, sem bloquear o redireccionamento por causa dela.
  sb.from('links_curtos')
    .update({ aberturas: (link.aberturas ?? 0) + 1, ultima_abertura: new Date().toISOString() })
    .eq('codigo', codigo)
    .then(({ error: erroContagem }) => {
      if (erroContagem) console.error('link-curto: falha a contar abertura', erroContagem);
    });

  return new Response(null, {
    status: 302,
    headers: {
      ...cors,
      Location: assinado.signedUrl,
      // O URL assinado dura dois minutos: guardar este redireccionamento em
      // cache dava um link morto na segunda abertura.
      'Cache-Control': 'no-store',
    },
  });
});
