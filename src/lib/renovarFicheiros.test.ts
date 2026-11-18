import { describe, expect, it, vi } from 'vitest';

import { importsRelativos, renovarFicheirosEmFalta, urlDoErro } from './renovarFicheiros';

const BASE = 'https://wegest.pt/renting/contratos/1';

describe('urlDoErro', () => {
  it('tira o endereço da mensagem do Chrome', () => {
    expect(
      urlDoErro(
        new TypeError(
          'Failed to fetch dynamically imported module: https://wegest.pt/assets/ContratoForm-ByETRlkP.js'
        ),
        BASE
      )
    ).toBe('https://wegest.pt/assets/ContratoForm-ByETRlkP.js');
  });
  it('aceita só o caminho (ex.: erro de CSS) e resolve contra a página', () => {
    expect(urlDoErro(new Error('Unable to preload CSS for /assets/a-1.css'), BASE)).toBe(
      'https://wegest.pt/assets/a-1.css'
    );
  });
  it('sem endereço na mensagem devolve null', () => {
    expect(urlDoErro(new TypeError('Importing a module script failed.'), BASE)).toBeNull();
    expect(urlDoErro(null, BASE)).toBeNull();
  });
});

describe('importsRelativos', () => {
  it('apanha import estático, import sem nome e re-export; ignora dinâmicos e não relativos', () => {
    const codigo =
      'import{u as d}from"./vendor-query-B5k.js";import{s as a}from"./index-Co8.js";' +
      'export{x}from"./useContratoCondutores-Dgv.js";import"./efeito-3.js";const m=()=>import("./Outro-1.js");' +
      'import z from"https://cdn.exemplo.com/x.js";';
    expect(importsRelativos(codigo, 'https://wegest.pt/assets/ContratoForm-By.js').sort()).toEqual(
      [
        'https://wegest.pt/assets/efeito-3.js',
        'https://wegest.pt/assets/index-Co8.js',
        'https://wegest.pt/assets/useContratoCondutores-Dgv.js',
        'https://wegest.pt/assets/vendor-query-B5k.js',
      ].sort()
    );
  });
});

function resposta(corpo: string, tipo = 'application/javascript', ok = true) {
  return {
    ok,
    headers: new Headers({ 'content-type': tipo }),
    text: async () => corpo,
  } as Response;
}

describe('renovarFicheirosEmFalta', () => {
  /** Servidor falso: `estragados` vêm como página na cache e certos com cache: 'reload'. */
  function servidor(
    ficheiros: Record<string, string>,
    estragados: string[] = [],
    semprePagina: string[] = []
  ) {
    const pedidos: string[] = [];
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      pedidos.push(`${u.split('/').pop()}|${init?.cache ?? 'default'}`);
      const nome = u.split('/').pop() as string;
      const pagina =
        semprePagina.includes(nome) || (estragados.includes(nome) && init?.cache !== 'reload');
      if (pagina) return resposta('<html></html>', 'text/html; charset=utf-8');
      return resposta(ficheiros[nome] ?? 'export{}');
    }) as unknown as typeof fetch;
    return { fetchFn, pedidos };
  }

  const erroDe = (nome: string) =>
    new TypeError(`Failed to fetch dynamically imported module: https://wegest.pt/assets/${nome}`);

  it('renova só a dependência que veio estragada (o erro nomeia o importador)', async () => {
    const { fetchFn, pedidos } = servidor(
      { 'ContratoForm-By.js': 'import{a}from"./useContratoCondutores-Dgv.js";import"./ok-1.js";' },
      ['useContratoCondutores-Dgv.js']
    );
    const r = await renovarFicheirosEmFalta(erroDe('ContratoForm-By.js'), {
      fetchFn,
      inicios: () => [],
      base: BASE,
    });
    expect(pedidos).toEqual([
      'ContratoForm-By.js|default',
      'useContratoCondutores-Dgv.js|default',
      'ok-1.js|default',
      'useContratoCondutores-Dgv.js|reload',
    ]);
    expect(r).toEqual({ verificados: 3, renovados: 1, aindaMaus: [] });
  });

  it('chega à dependência estragada mesmo com muitos imports no mesmo ficheiro (caso do ContratoForm: 83)', async () => {
    const deps = Array.from({ length: 83 }, (_, i) => `import"./d${i}-1.js";`).join('');
    const { fetchFn, pedidos } = servidor({ 'ContratoForm-1.js': deps }, ['d82-1.js']);
    const r = await renovarFicheirosEmFalta(erroDe('ContratoForm-1.js'), {
      fetchFn,
      inicios: () => [],
      base: BASE,
    });
    expect(r.verificados).toBe(84);
    expect(r.renovados).toBe(1);
    expect(pedidos).toContain('d82-1.js|reload');
    // Os 82 bons saíram da cache: só 1 ficheiro foi buscado de novo à rede.
    expect(pedidos.filter((p) => p.endsWith('|reload'))).toHaveLength(1);
  });

  it('avisa quando o servidor ainda devolve página no lugar do ficheiro', async () => {
    const { fetchFn } = servidor({}, [], ['X-1.js']);
    const r = await renovarFicheirosEmFalta(erroDe('X-1.js'), {
      fetchFn,
      inicios: () => [],
      base: BASE,
    });
    expect(r.renovados).toBe(0);
    expect(r.aindaMaus).toEqual(['https://wegest.pt/assets/X-1.js']);
  });

  it('sem endereço no erro, confere os ficheiros de arranque da página', async () => {
    const { fetchFn, pedidos } = servidor({}, ['v-2.js']);
    const r = await renovarFicheirosEmFalta(new TypeError('Importing a module script failed.'), {
      fetchFn,
      inicios: () => ['https://wegest.pt/assets/index-1.js', 'https://wegest.pt/assets/v-2.js'],
      base: BASE,
    });
    expect(r.verificados).toBe(2);
    expect(r.renovados).toBe(1);
    expect(pedidos).toContain('v-2.js|reload');
  });

  it('apaga a cópia do service worker só dos ficheiros estragados', async () => {
    const apagar = vi.fn(async () => true);
    const caixas = {
      keys: async () => ['workbox-precache-v2'],
      open: async () => ({ delete: apagar }),
    } as unknown as CacheStorage;
    const { fetchFn } = servidor({ 'A-1.js': 'import"./Y-1.js";import"./bom-1.js";' }, ['Y-1.js']);
    await renovarFicheirosEmFalta(erroDe('A-1.js'), {
      fetchFn,
      caches: caixas,
      inicios: () => [],
      base: BASE,
    });
    expect(apagar).toHaveBeenCalledTimes(1);
    expect(apagar).toHaveBeenCalledWith('https://wegest.pt/assets/Y-1.js', { ignoreSearch: true });
  });

  it('não segue as rotas que só abrem mais tarde (imports dinâmicos)', async () => {
    const { fetchFn, pedidos } = servidor({
      'index-1.js':
        'import{a}from"./vendor-1.js";const r=()=>import("./RotaA-1.js");const s=()=>import("./RotaB-1.js");',
    });
    await renovarFicheirosEmFalta(new TypeError('Importing a module script failed.'), {
      fetchFn,
      inicios: () => ['https://wegest.pt/assets/index-1.js'],
      base: BASE,
    });
    expect(pedidos).toEqual(['index-1.js|default', 'vendor-1.js|default']);
  });

  it('nunca lança, mesmo se a rede falhar, e não fica em ciclo', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('sem rede');
    }) as unknown as typeof fetch;
    const r = await renovarFicheirosEmFalta(erroDe('Z-1.js'), {
      fetchFn,
      inicios: () => [],
      base: BASE,
    });
    expect(r.aindaMaus).toEqual(['https://wegest.pt/assets/Z-1.js']);
  });

  it('imports circulares não repetem pedidos e há um teto de ficheiros', async () => {
    const { fetchFn, pedidos } = servidor({
      'A-1.js': 'import"./B-1.js";',
      'B-1.js': 'import"./A-1.js";',
    });
    await renovarFicheirosEmFalta(erroDe('A-1.js'), { fetchFn, inicios: () => [], base: BASE });
    expect(pedidos).toEqual(['A-1.js|default', 'B-1.js|default']);

    let n = 0;
    const infinito = vi.fn(async () => {
      n += 1;
      return resposta(`import"./f${n}-a.js";import"./g${n}-a.js";`);
    }) as unknown as typeof fetch;
    await renovarFicheirosEmFalta(erroDe('Raiz-1.js'), {
      fetchFn: infinito,
      inicios: () => [],
      base: BASE,
    });
    expect(n).toBeLessThanOrEqual(300);
  });
});
