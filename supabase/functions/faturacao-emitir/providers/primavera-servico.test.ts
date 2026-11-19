// Testa o adapter do serviço do Primavera com um fetch simulado: nada sai da máquina.
import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import { primaveraServicoProvider } from './primavera-servico.ts';
import { EmissaoAmbiguaError } from '../types.ts';

const cfg = (extra: Record<string, unknown> = {}) => ({
  apiKey: 'CHAVE-SECRETA',
  settings: {
    servico_url: 'https://servico.exemplo.pt/',
    ambiente: 'teste',
    empresa: 'dasprent',
    ...extra,
  },
});

const itens = [{ descricao: 'Aluguer', quantidade: 1, preco_unitario: 100, taxa_iva: 23 }];
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const SAUDE = { ok: true, serie_comunicada: true, fiscal: false };

interface Chamada {
  url: string;
  metodo: string;
  chave: string | null;
  corpo: Record<string, unknown> | null;
}

/** Simula o serviço: responde pela ordem a cada rota; guarda o que recebeu. */
async function comServico(
  respostas: (c: Chamada) => Response,
  correr: (chamadas: Chamada[]) => Promise<void>
) {
  const original = globalThis.fetch;
  const originalTimeout = globalThis.setTimeout;
  const chamadas: Chamada[] = [];
  // Sem esperas reais entre repetições.
  globalThis.setTimeout = ((fn: () => void, _ms?: number) =>
    originalTimeout(fn, 0)) as typeof setTimeout;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    const c: Chamada = {
      url: String(url),
      metodo: init?.method ?? 'GET',
      chave: h.get('x-api-key'),
      corpo: init?.body ? JSON.parse(String(init.body)) : null,
    };
    chamadas.push(c);
    return Promise.resolve(respostas(c));
  }) as typeof fetch;
  try {
    await correr(chamadas);
  } finally {
    globalThis.fetch = original;
    globalThis.setTimeout = originalTimeout;
  }
}

Deno.test(
  'emitir fatura: a empresa vai no caminho, a chave no cabeçalho, o ordem_id é a cobrança',
  async () => {
    await comServico(
      (c) =>
        c.url.endsWith('/saude')
          ? json(SAUDE)
          : json({ numero: 'FA 2026/52', id: 'FA-2026-52', total: 123, repetida: false }, 201),
      async (chamadas) => {
        const r = await primaveraServicoProvider.emit(
          { tipo: 'FT', cliente: { nome: 'Ana' }, itens, cobrancaId: 'cob-1' },
          cfg()
        );
        assertEquals(r.numero, 'FA 2026/52');
        assertEquals(r.doctype, 'FA');
        assertEquals(r.total, 123);
        assertEquals(chamadas[0].url, 'https://servico.exemplo.pt/dasprent/saude');
        const post = chamadas[1];
        assertEquals(post.url, 'https://servico.exemplo.pt/dasprent/faturas');
        assertEquals(post.metodo, 'POST');
        assertEquals(post.chave, 'CHAVE-SECRETA');
        assertEquals(post.corpo?.ordem_id, 'cob-1');
        assertEquals(post.corpo?.tipo, 'FA');
        assertEquals(post.corpo?.total_esperado, 123);
        // consumidor final: sem nif no cliente; linhas sem o campo antigo `tipo`
        assertEquals('nif' in (post.corpo?.cliente as object), false);
        assertEquals('tipo' in (post.corpo?.linhas as object[])[0], false);
      }
    );
  }
);

Deno.test('a trava de ambiente recusa antes de qualquer pedido que emita', async () => {
  await comServico(
    () => json({ ok: true, serie_comunicada: true, fiscal: true }),
    async (chamadas) => {
      const e = await assertRejects(() =>
        primaveraServicoProvider.emit(
          { tipo: 'FT', cliente: { nome: 'Ana' }, itens, cobrancaId: 'cob-trava' },
          cfg({ empresa: 'decada' })
        )
      );
      assertStringIncludes((e as Error).message, 'marcada como teste');
      assertEquals(chamadas.length, 1);
      assertEquals(chamadas[0].metodo, 'GET');
    }
  );
});

Deno.test('503 com tentar_de_novo: repete o mesmo pedido e emite uma vez', async () => {
  let posts = 0;
  await comServico(
    (c) => {
      if (c.url.endsWith('/saude')) return json(SAUDE);
      posts++;
      return posts === 1
        ? json({ codigo: 'servico_indisponivel', erro: 'x', tentar_de_novo: true }, 503)
        : json({ numero: 'FA 2026/53', total: 123 }, 201);
    },
    async (chamadas) => {
      const r = await primaveraServicoProvider.emit(
        { tipo: 'FT', cliente: { nome: 'Ana' }, itens, cobrancaId: 'cob-503' },
        cfg({ empresa: 'distancia' })
      );
      assertEquals(r.numero, 'FA 2026/53');
      const envios = chamadas.filter((c) => c.metodo === 'POST');
      assertEquals(envios.length, 2);
      assertEquals(envios[0].corpo?.ordem_id, envios[1].corpo?.ordem_id);
    }
  );
});

Deno.test('erro do serviço aparece com o texto do serviço, sem a chave', async () => {
  await comServico(
    (c) =>
      c.url.endsWith('/saude')
        ? json(SAUDE)
        : json(
            { codigo: 'consumidor_final_nao_configurado', erro: 'Consumidor final em falta.' },
            409
          ),
    async () => {
      const e = await assertRejects(() =>
        primaveraServicoProvider.emit(
          { tipo: 'FT', cliente: { nome: 'Ana' }, itens, cobrancaId: 'cob-cf' },
          cfg({ empresa: 'consumidor' })
        )
      );
      assertEquals((e as Error).message, 'Consumidor final em falta.');
    }
  );
});

Deno.test(
  'sem resposta ao emitir: pergunta pelo ordem_id e, se não confirma, é ambíguo',
  async () => {
    const original = globalThis.fetch;
    const originalTimeout = globalThis.setTimeout;
    let n = 0;
    globalThis.fetch = (() => {
      n++;
      if (n === 1) return Promise.resolve(json(SAUDE));
      return Promise.reject(new TypeError('connection reset'));
    }) as typeof fetch;
    try {
      await assertRejects(
        () =>
          primaveraServicoProvider.emit(
            { tipo: 'FT', cliente: { nome: 'Ana' }, itens, cobrancaId: 'cob-sem-resposta' },
            cfg({ empresa: 'dasprentsul' })
          ),
        EmissaoAmbiguaError
      );
    } finally {
      globalThis.fetch = original;
      globalThis.setTimeout = originalTimeout;
    }
  }
);

Deno.test(
  'nota de crédito total e recibo vão para o caminho da fatura, com a empresa',
  async () => {
    await comServico(
      (c) => {
        if (c.url.endsWith('/saude')) return json(SAUDE);
        if (c.url.endsWith('/notas-credito')) return json({ numero: 'NC 2026/2', total: 123 }, 201);
        return json({ recibo: 'RE 2026/11' }, 201);
      },
      async (chamadas) => {
        const nc = await primaveraServicoProvider.emit(
          { tipo: 'NC', cliente: { nome: 'Ana' }, itens, documento_referencia: 'FA 2026/52' },
          cfg({ empresa: 'urbango' })
        );
        assertEquals(nc.numero, 'NC 2026/2');
        const pedidoNc = chamadas.find((c) => c.url.endsWith('/notas-credito'))!;
        assertEquals(
          pedidoNc.url,
          'https://servico.exemplo.pt/urbango/faturas/FA-2026-52/notas-credito'
        );
        assertEquals(pedidoNc.corpo?.total_esperado, 123);
        assertEquals('linhas' in (pedidoNc.corpo as object), false);

        const re = await primaveraServicoProvider.emit(
          {
            tipo: 'RC',
            cliente: { nome: 'Ana' },
            itens,
            documentoOriginal: { doctype: 'FA', serie: '2026', docnum: '52' },
          },
          cfg({ empresa: 'urbango', metodo_pagamento: 'mbway' })
        );
        assertEquals(re.numero, 'RE 2026/11');
        const pedidoRe = chamadas.find((c) => c.url.endsWith('/pagamentos'))!;
        assertEquals(
          pedidoRe.url,
          'https://servico.exemplo.pt/urbango/faturas/FA-2026-52/pagamentos'
        );
        assertEquals(pedidoRe.corpo?.metodo, 'mbway');
        assertEquals(pedidoRe.corpo?.valor, 123);
      }
    );
  }
);

Deno.test('integração sem servico_url diz que o agente antigo já não existe', async () => {
  const e = await assertRejects(() =>
    primaveraServicoProvider.emit(
      { tipo: 'FT', cliente: { nome: 'Ana' }, itens, cobrancaId: 'x' },
      { apiKey: 'k', settings: { provider: 'primavera' } }
    )
  );
  assertStringIncludes((e as Error).message, 'agente antigo');
  assertEquals(
    primaveraServicoProvider.hasDoctype('FT', { settings: { provider: 'primavera' } }),
    false
  );
});

Deno.test(
  'testar ligação: empresa desconhecida e chave errada têm mensagens próprias',
  async () => {
    await comServico(
      () => json({ codigo: 'empresa_inexistente', erro: 'x' }, 404),
      async () => {
        const e = await assertRejects(() =>
          primaveraServicoProvider.health(cfg({ empresa: 'xpto' }))
        );
        assertStringIncludes((e as Error).message, 'código da empresa');
      }
    );
    await comServico(
      (c) =>
        c.url.endsWith('/saude') ? json(SAUDE) : json({ codigo: 'chave_invalida', erro: 'x' }, 401),
      async () => {
        const e = await assertRejects(() =>
          primaveraServicoProvider.health(cfg({ empresa: 'decada' }))
        );
        assertStringIncludes((e as Error).message, 'chave do serviço');
      }
    );
  }
);
