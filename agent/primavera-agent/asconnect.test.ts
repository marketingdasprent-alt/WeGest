import { describe, expect, it, vi } from 'vitest';
import {
  AmbiguoError,
  CLIENTES_POR_OMISSAO,
  type ConfigAsConnect,
  construirLinhas,
  criarClienteAsConnect,
  dataDocLisboa,
  estadoEhSucesso,
  extrairToken,
  ehEmpresaDeTeste,
  MENSAGEM_SEM_TEMPO_INSERIR,
  payloadFaturaTeste,
  pessoaSingular,
  variantesNif,
  criadoEmLocal,
  podeComecar,
  timeoutDoInserir,
  timeoutDoImprimir,
  lerRespostaImprimir,
} from './asconnect.ts';

const cfgBase: ConfigAsConnect = {
  primavera: { endpoint: 'http://srv:8090', username: 'u', password: 'p', enterprise: 'E' },
  iva_codes: { '23': '01', '0': '04' },
  tipos_documento: { FT: 'FA' },
  artigo_por_omissao: 'ALUGUER',
  clientes: CLIENTES_POR_OMISSAO,
  precos_com_iva: false,
  condicao_pagamento: '1',
};

interface Chamada {
  url: string;
  corpo: any;
}

/** fetch falso: devolve, por caminho, a resposta indicada e regista o corpo enviado. */
function fetchFalso(respostas: Record<string, unknown[]>) {
  const chamadas: Chamada[] = [];
  const fila = Object.fromEntries(Object.entries(respostas).map(([k, v]) => [k, [...v]]));
  const fn = (async (url: string, init?: RequestInit) => {
    const caminho = url.replace('http://srv:8090', '');
    chamadas.push({ url: caminho, corpo: init?.body ? JSON.parse(String(init.body)) : null });
    const r = fila[caminho]?.shift();
    if (r === undefined) throw new Error(`pedido inesperado: ${caminho}`);
    return new Response(typeof r === 'string' ? r : JSON.stringify(r), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, chamadas };
}

const SUCESSO = { Estado: { Mensagem: 'Sucesso' } };
const DOC_OK = {
  TipoDocGerado: 'FA',
  SerieDocGerado: '2026',
  NumeroDocGerado: '68',
  Documento: 'FA 2026/68',
  ...SUCESSO,
};
const payload = {
  tipo: 'FT' as const,
  cliente: { nome: 'Ana', nif: '234567890', morada: 'Rua A' },
  itens: [{ descricao: 'Aluguer semana 41', quantidade: 1, taxa_iva: 23, preco_unitario: 100 }],
  referencia_externa: 'CTR-12',
};

describe('helpers', () => {
  it('aceita "Sucesso" e "Sucesso." (os dois formatos do PDF)', () => {
    expect(estadoEhSucesso('Sucesso')).toBe(true);
    expect(estadoEhSucesso('Sucesso.')).toBe(true);
    expect(estadoEhSucesso('Erro: cliente inexistente')).toBe(false);
    expect(estadoEhSucesso(undefined)).toBe(false);
  });

  it('extrai o token em string simples, JSON string ou objecto', () => {
    expect(extrairToken('abc')).toBe('abc');
    expect(extrairToken('"abc"')).toBe('abc');
    expect(extrairToken('{"token":"abc"}')).toBe('abc');
    expect(extrairToken('{}')).toBeUndefined();
  });

  it('DataDoc sai na hora de Lisboa, sem fuso', () => {
    expect(dataDocLisboa(new Date('2026-10-13T09:23:38Z'))).toBe('2026-10-13T10:23:38');
    expect(dataDocLisboa(new Date('2026-12-01T09:00:00Z'))).toBe('2026-12-01T09:00:00');
  });

  it('procura o NIF com e sem o prefixo do país', () => {
    expect(variantesNif('234567890', 'PT')).toEqual(['234567890', 'PT234567890']);
    expect(variantesNif('BR258209887', 'BR')).toEqual(['BR258209887', '258209887']);
    expect(variantesNif(' 258 209 887 ', 'BR')).toEqual(['258209887', 'BR258209887']);
  });

  it('pessoa singular só para NIF português', () => {
    expect(pessoaSingular('234567890', 'PT')).toBe(true);
    expect(pessoaSingular('453456789', 'PT')).toBe(true);
    expect(pessoaSingular('509876543', 'PT')).toBe(false);
    expect(pessoaSingular('B12345678', 'ES')).toBeUndefined();
  });
});

describe('construirLinhas', () => {
  it('usa o artigo por omissão, o código de IVA mapeado e o preço sem IVA', () => {
    expect(construirLinhas(cfgBase, payload.itens)).toEqual([
      {
        Tipo: 'Normal',
        Artigo: 'ALUGUER',
        Descricao: 'Aluguer semana 41',
        Quantidade: '1',
        CodIva: '01',
        PrecoUnit: 100,
      },
    ]);
  });

  it('com precos_com_iva soma o IVA ao preço', () => {
    const [linha] = construirLinhas({ ...cfgBase, precos_com_iva: true }, payload.itens);
    expect(linha.PrecoUnit).toBe(123);
  });

  it('recusa taxa sem código, linha sem artigo e desconto', () => {
    expect(() => construirLinhas(cfgBase, [{ taxa_iva: 6, preco_unitario: 1 }])).toThrow(/6%/);
    expect(() => construirLinhas({ ...cfgBase, artigo_por_omissao: '' }, payload.itens)).toThrow(
      /artigo_por_omissao/
    );
    expect(() => construirLinhas(cfgBase, [{ ...payload.itens[0], desconto: 10 }])).toThrow(
      /desconto/
    );
  });
});

describe('emitir', () => {
  it('cliente existente: usa o código do Primavera como Entidade e TipoDocumento FA', async () => {
    const { fn, chamadas } = fetchFalso({
      '/auth/gettoken': ['tok'],
      '/erp/query/tabledata': [{ Resultado: [{ Cliente: '2111032' }], ...SUCESSO }],
      '/documentos/vendas/inserir': [DOC_OK],
    });
    const r = await criarClienteAsConnect(cfgBase, fn).emitir(
      payload,
      new Date('2026-10-13T09:00:00Z')
    );

    expect(chamadas.map((c) => c.url)).toEqual([
      '/auth/gettoken',
      '/erp/query/tabledata',
      '/documentos/vendas/inserir',
    ]);
    expect(chamadas[1].corpo.Query).toMatchObject({
      Table: 'Clientes',
      LogicalOperator: 'OR',
      Filters: [
        { field: 'NumContrib', operator: 'Equal', value: '234567890' },
        { field: 'NumContrib', operator: 'Equal', value: 'PT234567890' },
      ],
    });
    const doc = chamadas[2].corpo.Documento;
    expect(doc.TipoDocumento).toBe('FA');
    expect(doc.CondPag).toBe('1');
    expect(doc.Entidade).toBe('2111032');
    expect(doc.DataDoc).toBe('2026-10-13T10:00:00');
    expect(doc.Referencia).toBe('CTR-12');
    expect(r).toMatchObject({ doctype: 'FA', docnum: '68', serie: '2026', numero: 'FA 2026/68' });
  });

  it('cliente novo: cria-o com código = NIF já com a CondPag, sem atualizar a ficha', async () => {
    const { fn, chamadas } = fetchFalso({
      '/auth/gettoken': ['tok'],
      '/erp/query/tabledata': [{ Resultado: [], ...SUCESSO }],
      '/ficha/cliente/inserir': [{ CodCliente: '234567890', Adicionado: true, ...SUCESSO }],
      '/documentos/vendas/inserir': [DOC_OK],
    });
    await criarClienteAsConnect(cfgBase, fn).emitir(payload);

    const cliente = chamadas.find((c) => c.url === '/ficha/cliente/inserir')!.corpo.Cliente;
    expect(cliente).toMatchObject({
      Codigo: '234567890',
      NIF: '234567890',
      Nome: 'Ana',
      Pais: 'PT',
      PessoaSingular: true,
      Idioma: 'PT',
      CondPag: '1',
    });
    // O inserir grava a CondPag (provado no DASPWSTEST a 2026-10-22, FA 2026/51).
    expect(chamadas.some((c) => c.url === '/ficha/cliente/atualizar')).toBe(false);
    expect(chamadas.at(-1)!.corpo.Documento.Entidade).toBe('234567890');
  });

  it('config incompleta falha antes de tocar no Primavera (nem cria cliente)', async () => {
    const { fn, chamadas } = fetchFalso({});
    await expect(
      criarClienteAsConnect({ ...cfgBase, iva_codes: {} }, fn).emitir(payload)
    ).rejects.toThrow(/IVA/);
    expect(chamadas).toHaveLength(0);
  });

  it('recusa consumidor final e tipos sem TipoDocumento', async () => {
    const { fn } = fetchFalso({});
    const c = criarClienteAsConnect(cfgBase, fn);
    await expect(c.emitir({ ...payload, cliente: { nif: '999999990' } })).rejects.toThrow(
      /consumidor final/
    );
    await expect(c.emitir({ ...payload, tipo: 'NC' })).rejects.toThrow(/tipos_documento/);
  });

  it('propaga a mensagem do Primavera quando recusa o documento', async () => {
    const { fn } = fetchFalso({
      '/auth/gettoken': ['tok'],
      '/erp/query/tabledata': [{ Resultado: [{ cliente: 'C1' }], ...SUCESSO }],
      '/documentos/vendas/inserir': [{ Estado: { Mensagem: 'Artigo ALUGUER inexistente' } }],
    });
    await expect(criarClienteAsConnect(cfgBase, fn).emitir(payload)).rejects.toThrow(
      'Primavera recusou: Artigo ALUGUER inexistente'
    );
  });
});

describe('emitir: desfecho ambíguo', () => {
  const ANTES = {
    '/auth/gettoken': ['tok'],
    '/erp/query/tabledata': [{ Resultado: [{ Cliente: 'C1' }], ...SUCESSO }],
  };

  /** Como fetchFalso, mas o inserir responde com o que a função devolver. */
  function comInserir(inserir: () => Promise<Response>) {
    const { fn: base } = fetchFalso(ANTES);
    return (async (url: string, init?: RequestInit) =>
      url.endsWith('/documentos/vendas/inserir') ? inserir() : base(url, init)) as typeof fetch;
  }

  it.each([
    ['corte de rede depois de o pedido sair', () => Promise.reject(new TypeError('network'))],
    ['HTTP 500', async () => new Response('erro interno', { status: 500 })],
    ['resposta sem forma', async () => new Response('<html>', { status: 200 })],
    [
      'Sucesso sem NumeroDocGerado',
      async () => new Response(JSON.stringify(SUCESSO), { status: 200 }),
    ],
  ])('%s → AmbiguoError (o documento pode existir)', async (_nome, inserir) => {
    await expect(
      criarClienteAsConnect(cfgBase, comInserir(inserir)).emitir(payload)
    ).rejects.toBeInstanceOf(AmbiguoError);
  });

  it('recusa explícita e falhas antes do inserir não são ambíguas', async () => {
    const recusa = criarClienteAsConnect(
      cfgBase,
      comInserir(async () => new Response(JSON.stringify({ Estado: { Mensagem: 'NIF inválido' } })))
    ).emitir(payload);
    await expect(recusa).rejects.toThrow('Primavera recusou: NIF inválido');
    await expect(recusa).rejects.not.toBeInstanceOf(AmbiguoError);

    const semToken = (async () => new Response('negado', { status: 401 })) as typeof fetch;
    await expect(
      criarClienteAsConnect(cfgBase, semToken).emitir(payload)
    ).rejects.not.toBeInstanceOf(AmbiguoError);
  });
});

describe('prazo do WeGest', () => {
  it('a idade do pedido mede-se com os relógios do servidor, não com o desta máquina', () => {
    // Máquina 10 min adiantada: o servidor diz que o pedido tem 5 s.
    const local = Date.parse('2026-10-13T10:10:00Z');
    expect(criadoEmLocal('2026-10-13T10:00:00.000Z', '2026-10-13T10:00:05.000Z', local)).toBe(
      local - 5_000
    );
    // Sem a hora do servidor, usa-se o created_at tal como vem.
    expect(criadoEmLocal('2026-10-13T10:00:00.000Z', undefined, local)).toBe(
      Date.parse('2026-10-13T10:00:00Z')
    );
    expect(criadoEmLocal(undefined, '2026-10-13T10:00:05.000Z', local)).toBeUndefined();
    expect(criadoEmLocal('lixo', undefined, local)).toBeUndefined();
  });

  it('não começa um pedido com mais de 30 s', () => {
    expect(podeComecar(0, 30_000)).toBe(true);
    expect(podeComecar(0, 30_001)).toBe(false);
    expect(podeComecar(undefined, 999_999)).toBe(true);
  });

  it('o inserir acaba até 43 s depois da criação; com menos de 8 s não se envia', () => {
    expect(timeoutDoInserir(0, 10_000)).toBe(33_000);
    expect(timeoutDoInserir(0, 35_000)).toBe(8_000);
    expect(timeoutDoInserir(0, 35_001)).toBeNull();
    expect(timeoutDoInserir(undefined, 0)).toBe(60_000);
  });

  it('sem tempo para o inserir, falha sem o enviar (não é ambíguo)', async () => {
    const { fn, chamadas } = fetchFalso({
      '/auth/gettoken': ['tok'],
      '/erp/query/tabledata': [{ Resultado: [{ Cliente: 'C1' }], ...SUCESSO }],
    });
    const r = criarClienteAsConnect(cfgBase, fn).emitir(payload, new Date(), {
      criadoEm: 0,
      relogio: () => 36_000,
    });
    await expect(r).rejects.toThrow(MENSAGEM_SEM_TEMPO_INSERIR);
    await expect(r).rejects.not.toBeInstanceOf(AmbiguoError);
    expect(chamadas.map((c) => c.url)).not.toContain('/documentos/vendas/inserir');
  });

  it('com tempo, envia o inserir com um limite que acaba dentro do prazo', async () => {
    const sinais: AbortSignal[] = [];
    const { fn: base, chamadas } = fetchFalso({
      '/auth/gettoken': ['tok'],
      '/erp/query/tabledata': [{ Resultado: [{ Cliente: 'C1' }], ...SUCESSO }],
      '/documentos/vendas/inserir': [DOC_OK],
    });
    const fn = (async (url: string, init?: RequestInit) => {
      if (init?.signal) sinais.push(init.signal);
      return base(url, init);
    }) as typeof fetch;
    const r = await criarClienteAsConnect(cfgBase, fn).emitir(payload, new Date(), {
      criadoEm: 0,
      relogio: () => 20_000,
    });
    expect(r.numero).toBe('FA 2026/68');
    expect(chamadas.at(-1)!.url).toBe('/documentos/vendas/inserir');
    expect(sinais.at(-1)!.aborted).toBe(false);
  });
});

describe('garantirCliente: CondPag do cliente existente', () => {
  it.each([null, '', '  '])(
    'CondPag %j: grava-a antes do documento (cliente meio criado por um timeout)',
    async (condPag) => {
      const { fn, chamadas } = fetchFalso({
        '/auth/gettoken': ['tok'],
        '/erp/query/tabledata': [
          { Resultado: [{ Cliente: '234567890', CondPag: condPag }], ...SUCESSO },
        ],
        '/ficha/cliente/atualizar': [{ Atualizado: true, ...SUCESSO }],
        '/documentos/vendas/inserir': [DOC_OK],
      });
      await criarClienteAsConnect(cfgBase, fn).emitir(payload);
      expect(chamadas.map((c) => c.url)).toEqual([
        '/auth/gettoken',
        '/erp/query/tabledata',
        '/ficha/cliente/atualizar',
        '/documentos/vendas/inserir',
      ]);
      expect(chamadas[1].corpo.Query.Columns).toEqual(['Cliente', 'CondPag']);
      expect(chamadas[2].corpo).toEqual({ Cliente: { Codigo: '234567890', CondPag: '1' } });
    }
  );

  it('com CondPag preenchida, ou sem a coluna na resposta, não mexe no cliente', async () => {
    for (const linha of [{ Cliente: 'C1', CondPag: '2' }, { Cliente: 'C1' }]) {
      const { fn, chamadas } = fetchFalso({
        '/auth/gettoken': ['tok'],
        '/erp/query/tabledata': [{ Resultado: [linha], ...SUCESSO }],
        '/documentos/vendas/inserir': [DOC_OK],
      });
      await criarClienteAsConnect(cfgBase, fn).emitir(payload);
      expect(chamadas.map((c) => c.url)).not.toContain('/ficha/cliente/atualizar');
    }
  });

  it('se a reparação é recusada, falha antes do documento', async () => {
    const { fn, chamadas } = fetchFalso({
      '/auth/gettoken': ['tok'],
      '/erp/query/tabledata': [{ Resultado: [{ Cliente: 'C1', CondPag: null }], ...SUCESSO }],
      '/ficha/cliente/atualizar': [{ Estado: { Mensagem: 'Erro' } }],
    });
    await expect(criarClienteAsConnect(cfgBase, fn).emitir(payload)).rejects.toThrow(
      /C1 sem condição de pagamento/
    );
    expect(chamadas.map((c) => c.url)).not.toContain('/documentos/vendas/inserir');
  });
});

describe('testar', () => {
  it('falha se o artigo por omissão não existe no Primavera', async () => {
    const { fn } = fetchFalso({
      '/auth/gettoken': ['tok'],
      '/erp/query/tabledata': [{ Resultado: [], ...SUCESSO }],
    });
    await expect(criarClienteAsConnect(cfgBase, fn).testar()).rejects.toThrow(/ALUGUER/);
  });
});

describe('consultar', () => {
  it('com colunas, ordena pela primeira — o AS Connect recusa Pagination sem OrderBy', async () => {
    const { fn, chamadas } = fetchFalso({
      '/auth/gettoken': ['tok'],
      '/erp/query/tabledata': [{ Resultado: [], ...SUCESSO }],
    });
    await criarClienteAsConnect(cfgBase, fn).consultar('ASC_Artigos', {
      colunas: ['artigo'],
      pageSize: 5,
    });
    expect(chamadas[1].corpo.Query).toMatchObject({
      OrderBy: [{ field: 'artigo', direction: 'Asc' }],
      Pagination: { page: 1, pageSize: 5 },
    });
  });

  it('com "*" e sem campo, não pagina e corta as linhas do lado do agente', async () => {
    const { fn, chamadas } = fetchFalso({
      '/auth/gettoken': ['tok'],
      '/erp/query/tabledata': [{ Resultado: [{ a: 1 }, { a: 2 }, { a: 3 }], ...SUCESSO }],
    });
    const r = await criarClienteAsConnect(cfgBase, fn).consultar('ASC_Clientes', { pageSize: 2 });
    expect(r).toEqual([{ a: 1 }, { a: 2 }]);
    expect(chamadas[1].corpo.Query.Pagination).toBeUndefined();
    expect(chamadas[1].corpo.Query.OrderBy).toBeUndefined();
  });
});

describe('fatura de teste', () => {
  it('só aceita empresas de teste', () => {
    expect(ehEmpresaDeTeste('DASPWSTEST')).toBe(true);
    expect(ehEmpresaDeTeste('ERPWSDASP_Testes')).toBe(true);
    expect(ehEmpresaDeTeste('DASPRENT')).toBe(false);
  });

  it('gera uma FT de uma linha a 23% com o preço sem IVA indicado', () => {
    const p = payloadFaturaTeste('234567890', 10);
    expect(p.tipo).toBe('FT');
    expect(p.cliente?.nif).toBe('234567890');
    expect(construirLinhas(cfgBase, p.itens ?? [])).toMatchObject([
      { Artigo: 'ALUGUER', CodIva: '01', PrecoUnit: 10 },
    ]);
  });
});

describe('imprimir (PDF de um documento já emitido)', () => {
  // A forma da resposta real de 14/10/2026 (DocGerado encurtado).
  const IMPRESSO = {
    TipoDocGerado: 'FA',
    SerieDocGerado: '2026',
    NumeroDocGerado: '50',
    IdDocGerado: 'abc',
    Documento: 'FA 2026/50',
    DocGerado: 'JVBERi0xLjQK',
    ExtensaoDocGerado: 'PDF',
    ...SUCESSO,
  };

  it('pede FA/2026/50 com DevolvePDF e devolve o base64 e a extensão', async () => {
    const { fn, chamadas } = fetchFalso({
      '/auth/gettoken': ['tok'],
      '/documentos/vendas/imprimir': [IMPRESSO],
    });
    const r = await criarClienteAsConnect(cfgBase, fn).imprimir('FA', '2026', '50', 20_000);
    expect(r).toEqual({ base64: 'JVBERi0xLjQK', extensao: 'PDF' });
    expect(chamadas.map((c) => c.url)).toEqual(['/auth/gettoken', '/documentos/vendas/imprimir']);
    expect(chamadas[1].corpo).toEqual({
      Documento: { TipoDocumento: 'FA', Serie: '2026', NumeroDoc: '50' },
      Impressao: { DevolvePDF: true },
    });
  });

  it('o timeout indicado manda no pedido, não os 12 s dos outros', async () => {
    const timeouts = vi.spyOn(AbortSignal, 'timeout');
    const { fn } = fetchFalso({
      '/auth/gettoken': ['tok'],
      '/documentos/vendas/imprimir': [IMPRESSO],
    });
    try {
      // Relógio parado: o token leva os 12 s habituais, o imprimir os 20 s todos.
      await criarClienteAsConnect(cfgBase, fn).imprimir('FA', '2026', '50', 20_000, () => 0);
      expect(timeouts.mock.calls.map((c) => c[0])).toEqual([12_000, 20_000]);
    } finally {
      timeouts.mockRestore();
    }
  });

  it('sem tempo depois do token, não pede o PDF', async () => {
    let t = 0;
    const { fn, chamadas } = fetchFalso({ '/auth/gettoken': ['tok'] });
    const relogio = () => (t += 6_000);
    await expect(
      criarClienteAsConnect(cfgBase, fn).imprimir('FA', '2026', '50', 10_000, relogio)
    ).rejects.toThrow('sem tempo');
    expect(chamadas.map((c) => c.url)).toEqual(['/auth/gettoken']);
  });

  it('HTTP de erro, Estado de recusa, DocGerado vazio ou rede em baixo: falha simples', async () => {
    const http = (async (url: string) =>
      url.endsWith('/auth/gettoken')
        ? new Response('tok')
        : new Response('erro interno', { status: 500 })) as unknown as typeof fetch;
    const r1 = criarClienteAsConnect(cfgBase, http).imprimir('FA', '2026', '50', 20_000);
    await expect(r1).rejects.toThrow('imprimir falhou (HTTP 500)');
    await expect(r1).rejects.not.toBeInstanceOf(AmbiguoError);

    const rede = (async (url: string) => {
      if (url.endsWith('/auth/gettoken')) return new Response('tok');
      throw new TypeError('connection refused');
    }) as unknown as typeof fetch;
    const r2 = criarClienteAsConnect(cfgBase, rede).imprimir('FA', '2026', '50', 20_000);
    await expect(r2).rejects.toThrow('sem resposta do Primavera (connection refused)');
    await expect(r2).rejects.not.toBeInstanceOf(AmbiguoError);
  });

  it('lê a resposta: recusa, ficheiro vazio, não-JSON e extensão por omissão', () => {
    expect(() =>
      lerRespostaImprimir(200, JSON.stringify({ Estado: { Mensagem: 'Documento inexistente' } }))
    ).toThrow('Primavera recusou imprimir: Documento inexistente');
    expect(() => lerRespostaImprimir(200, JSON.stringify({ DocGerado: 'eA==' }))).toThrow(
      'sem Estado'
    );
    expect(() => lerRespostaImprimir(200, JSON.stringify({ ...SUCESSO, DocGerado: '' }))).toThrow(
      'DocGerado vazio'
    );
    expect(() => lerRespostaImprimir(200, '<html>')).toThrow('não-JSON');
    expect(() => lerRespostaImprimir(404, 'nada')).toThrow('HTTP 404');
    expect(lerRespostaImprimir(200, JSON.stringify({ ...SUCESSO, DocGerado: 'eA==' }))).toEqual({
      base64: 'eA==',
      extensao: 'PDF',
    });
    // As views devolvem capitalização mista; "Sucesso." também é sucesso.
    expect(
      lerRespostaImprimir(
        200,
        JSON.stringify({
          estado: { mensagem: 'Sucesso.' },
          docgerado: 'eA==',
          extensaodocgerado: '.pdf',
        })
      )
    ).toEqual({ base64: 'eA==', extensao: 'PDF' });
  });

  it('prazo: não começa com mais de 30 s e acaba até aos 38 s', () => {
    expect(timeoutDoImprimir(0, 5_000)).toBe(33_000);
    expect(timeoutDoImprimir(0, 30_000)).toBe(8_000);
    expect(timeoutDoImprimir(0, 30_001)).toBeNull();
    expect(timeoutDoImprimir(undefined, 999_999)).toBe(38_000);
  });
});
