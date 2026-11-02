// Cloudflare Pages: wegest.pt/api/rent-a-car[/*] → edge function api-rent-a-car do Supabase
// (o mesmo que o rewrite do vercel.json). Só esta rota corre como Function; o resto do site é
// estático. Em docs.wegest.pt a rota não existe: devolve a SPA, como na Vercel.
const DESTINO = 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car';

export const onRequest = async ({ request, env }) => {
  const url = new URL(request.url);
  if (url.hostname === 'docs.wegest.pt') {
    return env.ASSETS.fetch(new URL('/index.html', url));
  }
  const resto = url.pathname.slice('/api/rent-a-car'.length);
  return fetch(new Request(`${DESTINO}${resto}${url.search}`, request));
};
