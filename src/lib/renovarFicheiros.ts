// Quando um ficheiro do site chega estragado (a página de erro do servidor no
// lugar de um .js, como na publicação de 18/11/2026 entre as 10:50 e as 10:59),
// o navegador guarda essa resposta por um ano (Cache-Control immutable) e um
// simples recarregar não a troca: as páginas que usam esse ficheiro ficam em
// "Esta secção não conseguiu abrir" até alguém limpar a cache à mão.
//
// Aqui o próprio site faz essa limpeza: volta a pedir ao servidor, ignorando a
// cache (`cache: 'reload'`, que também substitui a cópia guardada), o ficheiro
// que falhou e os que ele importa. O erro do Chrome só nomeia o ficheiro que
// pediu o import, não o que veio estragado lá dentro, por isso segue-se a
// árvore de imports.

// Teto de segurança: uma página tem algumas centenas de ficheiros no máximo. Os bons saem da
// cache, por isso conferir muitos custa pouco; só os estragados vão à rede.
const MAX_FICHEIROS = 300;
const LOTE = 12;

const PADRAO_URL = /(https?:\/\/[^\s"'`)]+\.(?:m?js|css))/i;
const PADRAO_CAMINHO = /(\/assets\/[^\s"'`)]+\.(?:m?js|css))/i;
// Só imports estáticos (`from"./x.js"` e `import"./x.js"`): são os que a rota precisa para
// abrir. Os dinâmicos `import("./x.js")` são outras rotas, abertas mais tarde; seguir-lhes
// o rasto gastava o teto em todo o site (e podia deixar de fora a dependência certa).
const PADRAO_IMPORT = /(?:\bfrom|\bimport)\s*["'](\.{1,2}\/[^"']+\.(?:m?js|css))["']/g;

/** Endereço do ficheiro nomeado na mensagem do erro, se houver. */
export function urlDoErro(erro: unknown, base: string): string | null {
  const texto = erro instanceof Error ? erro.message : typeof erro === 'string' ? erro : '';
  const m = PADRAO_URL.exec(texto) ?? PADRAO_CAMINHO.exec(texto);
  if (!m) return null;
  try {
    return new URL(m[1], base).href;
  } catch {
    return null;
  }
}

/** Ficheiros que um módulo importa de forma estática, por caminho relativo, já resolvidos. */
export function importsRelativos(codigo: string, urlBase: string): string[] {
  const urls = new Set<string>();
  for (const m of codigo.matchAll(PADRAO_IMPORT)) {
    try {
      urls.add(new URL(m[1], urlBase).href);
    } catch {
      // caminho inválido: ignora
    }
  }
  return [...urls];
}

interface Ambiente {
  fetchFn: typeof fetch;
  caches?: CacheStorage;
  /** Ficheiros de arranque a renovar quando o erro não diz qual falhou. */
  inicios: () => string[];
  base: string;
}

function ambienteDoNavegador(): Ambiente {
  return {
    fetchFn: (entrada, opcoes) => fetch(entrada, opcoes),
    caches: typeof caches !== 'undefined' ? caches : undefined,
    inicios: () =>
      Array.from(
        document.querySelectorAll<HTMLElement>('link[rel="modulepreload"], script[type="module"]')
      )
        .map((el) => (el as HTMLLinkElement).href || (el as HTMLScriptElement).src)
        .filter(Boolean),
    base: window.location.href,
  };
}

export interface ResultadoRenovacao {
  /** Ficheiros conferidos (da cache ou da rede). */
  verificados: number;
  /** Ficheiros estragados que se foram buscar de novo ao servidor. */
  renovados: number;
  /** Ficheiros que o servidor ainda devolve como página (o problema é do servidor, não da cache). */
  aindaMaus: string[];
}

async function tirarDasCaches(caixas: CacheStorage | undefined, url: string): Promise<void> {
  if (!caixas) return;
  try {
    for (const nome of await caixas.keys()) {
      await (await caixas.open(nome)).delete(url, { ignoreSearch: true });
    }
  } catch {
    // sem acesso às caches: a renovação pela rede continua a valer
  }
}

/** Um ficheiro de código que veio como página (ou com erro) está estragado. */
const estaBom = (r: Response): boolean =>
  r.ok && !(r.headers.get('content-type') ?? '').includes('text/html');

/**
 * Confere um ficheiro como o navegador o usaria (com a cache dele): se veio
 * estragado, apaga a cópia e vai buscá-lo de novo à rede. Só os estragados custam
 * um descarregamento; os bons saem da cache. Devolve o que ele importa.
 */
async function verificar(
  url: string,
  ambiente: Ambiente,
  resultado: ResultadoRenovacao
): Promise<string[]> {
  try {
    let resposta = await ambiente.fetchFn(url);
    resultado.verificados += 1;
    if (!estaBom(resposta)) {
      await tirarDasCaches(ambiente.caches, url);
      resposta = await ambiente.fetchFn(url, { cache: 'reload' });
      if (!estaBom(resposta)) {
        resultado.aindaMaus.push(url);
        return [];
      }
      resultado.renovados += 1;
    }
    return /\.m?js(\?|$)/i.test(url) ? importsRelativos(await resposta.text(), url) : [];
  } catch {
    resultado.aindaMaus.push(url);
    return [];
  }
}

/**
 * Confere o ficheiro do erro (ou, sem ele, os de arranque da página) e tudo o que
 * importam, por níveis, e renova os que vieram estragados. Nunca lança: o pior caso
 * é não renovar nada.
 */
export async function renovarFicheirosEmFalta(
  erro: unknown,
  ambiente: Ambiente = ambienteDoNavegador()
): Promise<ResultadoRenovacao> {
  const resultado: ResultadoRenovacao = { verificados: 0, renovados: 0, aindaMaus: [] };
  const alvo = urlDoErro(erro, ambiente.base);
  let nivel = alvo ? [alvo] : ambiente.inicios();
  const vistos = new Set<string>();

  while (nivel.length > 0 && vistos.size < MAX_FICHEIROS) {
    const novos = [...new Set(nivel)]
      .filter((u) => !vistos.has(u))
      .slice(0, MAX_FICHEIROS - vistos.size);
    novos.forEach((u) => vistos.add(u));
    const seguintes: string[] = [];
    for (let i = 0; i < novos.length; i += LOTE) {
      const parte = await Promise.all(
        novos.slice(i, i + LOTE).map((u) => verificar(u, ambiente, resultado))
      );
      seguintes.push(...parte.flat());
    }
    nivel = seguintes;
  }
  return resultado;
}
