// Onde vive o site da documentação. Em docs.wegest.pt as páginas estão na raiz
// (o rewrite da Vercel não muda o URL do browser, o React Router vê '/erros');
// dentro da app, em /docs/*.
export const DOMINIO_DOCS = 'docs.wegest.pt';
export const URL_DOCS = `https://${DOMINIO_DOCS}`;

export function ehDominioDocs(hostname: string): boolean {
  return hostname === DOMINIO_DOCS;
}

export function baseDocs(hostname: string): '' | '/docs' {
  return ehDominioDocs(hostname) ? '' : '/docs';
}

/** Href absoluto de um slug ('' = Introdução; pode trazer '#ancora'). */
export function hrefDocs(base: string, destino: string): string {
  const [slug, ancora] = destino.split('#');
  const caminho = `${base}/${slug}`.replace(/\/+$/, '') || '/';
  return ancora ? `${caminho}#${ancora}` : caminho;
}

/** Slug da página a partir do pathname actual. */
export function slugDoCaminho(base: string, pathname: string): string {
  const semBase = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  return semBase.replace(/^\/+|\/+$/g, '');
}
