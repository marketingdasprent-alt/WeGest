import { assertEquals, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';

import {
  avaliarAmbiente,
  dividirNumero,
  falhaDoServico,
  lerConfigServico,
  linhasDoPedido,
  nifDoPedido,
  numeroNoUrl,
  pedidoDeFatura,
  repararAcentos,
  tipoDoServico,
} from './primaveraServico.ts';

const itens = [
  { descricao: 'Aluguer de viatura', quantidade: 1, preco_unitario: 100, taxa_iva: 23 },
];

Deno.test('sem servico_url não há serviço (o agente antigo da AS Connect já não existe)', () => {
  assertEquals(lerConfigServico({ provider: 'primavera' }).modo, 'sem_servico');
  assertEquals(lerConfigServico(null).modo, 'sem_servico');
  assertEquals(lerConfigServico({ servico_url: '   ' }).modo, 'sem_servico');
});

Deno.test('com servico_url lê a configuração, sem barra no fim e com método por omissão', () => {
  const l = lerConfigServico({
    servico_url: 'https://primavera.exemplo.pt/',
    ambiente: 'producao',
    empresa: ' Dasprent ',
  });
  assertEquals(l.modo, 'servico');
  if (l.modo === 'servico') {
    assertEquals(l.config.url, 'https://primavera.exemplo.pt');
    assertEquals(l.config.ambiente, 'producao');
    assertEquals(l.config.empresa, 'dasprent');
    assertEquals(l.config.metodoPagamento, 'transferencia');
  }
});

Deno.test('método de pagamento válido é respeitado, inválido volta ao padrão', () => {
  const base = { servico_url: 'https://x.pt', ambiente: 'teste', empresa: 'dasprent' };
  const a = lerConfigServico({ ...base, metodo_pagamento: 'mbway' });
  const b = lerConfigServico({ ...base, metodo_pagamento: 'cheque' });
  assertEquals(a.modo === 'servico' && a.config.metodoPagamento, 'mbway');
  assertEquals(b.modo === 'servico' && b.config.metodoPagamento, 'transferencia');
});

Deno.test('o ambiente tem de vir declarado e o endereço tem de ser https', () => {
  const empresa = 'dasprent';
  const semAmbiente = lerConfigServico({ servico_url: 'https://x.pt', empresa });
  assertEquals(semAmbiente.modo, 'invalido');
  const ambienteMau = lerConfigServico({ servico_url: 'https://x.pt', ambiente: 'demo', empresa });
  assertEquals(ambienteMau.modo, 'invalido');
  const http = lerConfigServico({ servico_url: 'http://x.pt', ambiente: 'teste', empresa });
  assertEquals(http.modo, 'invalido');
  assertEquals(
    lerConfigServico({ servico_url: 'http://localhost:8787', ambiente: 'teste', empresa }).modo,
    'servico'
  );
});

Deno.test('a empresa no serviço é obrigatória e só aceita minúsculas, números e hífen', () => {
  const base = { servico_url: 'https://x.pt', ambiente: 'teste' };
  const sem = lerConfigServico(base);
  assertEquals(sem.modo, 'invalido');
  assertStringIncludes(sem.modo === 'invalido' ? sem.erro : '', 'empresa');
  assertEquals(lerConfigServico({ ...base, empresa: '   ' }).modo, 'invalido');
  assertEquals(lerConfigServico({ ...base, empresa: 'dasp/rent' }).modo, 'invalido');
  assertEquals(lerConfigServico({ ...base, empresa: '../dasprent' }).modo, 'invalido');
  assertEquals(lerConfigServico({ ...base, empresa: 'dasprent sul' }).modo, 'invalido');
  assertEquals(lerConfigServico({ ...base, empresa: 'dasprent-sul' }).modo, 'servico');
});

Deno.test('números de documento: no endereço e a dividir em tipo, série e número', () => {
  assertEquals(numeroNoUrl('FA 2026U/1'), 'FA-2026U-1');
  assertEquals(numeroNoUrl(' NC 2026/60 '), 'NC-2026-60');
  assertEquals(dividirNumero('FA 2026U/119'), { doctype: 'FA', serie: '2026U', docnum: '119' });
  assertEquals(dividirNumero('RE 2026U/16'), { doctype: 'RE', serie: '2026U', docnum: '16' });
  assertEquals(dividirNumero('estranho'), { doctype: 'estranho', serie: '', docnum: 'estranho' });
});

Deno.test('FT vira FA e FR fica FR; NC e RC não são faturas', () => {
  assertEquals(tipoDoServico('FT'), 'FA');
  assertEquals(tipoDoServico('FR'), 'FR');
  assertEquals(tipoDoServico('NC'), null);
  assertEquals(tipoDoServico('RC'), null);
});

Deno.test('linhas: código de IVA do Primavera por taxa, preço sem IVA, desconto em %', () => {
  const l = linhasDoPedido([
    { descricao: 'A', quantidade: 2, preco_unitario: 10.005, taxa_iva: 23 },
    { descricao: 'B', quantidade: 1, preco_unitario: 5, taxa_iva: 13, desconto: 10 },
    { descricao: '', quantidade: 1, preco_unitario: 1, taxa_iva: 6 },
  ]);
  assertEquals(l[0].iva_codigo, '23');
  assertEquals(l[0].preco_unitario, 10.01);
  assertEquals(l[1].iva_codigo, '13');
  assertEquals(l[1].desconto_pct, 10);
  assertEquals(l[2].iva_codigo, '06');
  assertEquals(l[2].descricao, 'Aluguer de viatura');
});

Deno.test('linha isenta de IVA é recusada antes de falar com o Primavera', () => {
  const e = assertThrows(
    () => linhasDoPedido([{ descricao: 'x', quantidade: 1, preco_unitario: 10, taxa_iva: 0 }]),
    Error
  );
  assertStringIncludes(e.message, 'isenta de IVA');
  assertStringIncludes(e.message, 'Nada foi emitido');
});

Deno.test(
  'taxa de IVA desconhecida, quantidade e preço inválidos, e sem linhas, são recusados',
  () => {
    assertThrows(
      () => linhasDoPedido([{ descricao: 'x', quantidade: 1, preco_unitario: 10, taxa_iva: 16 }]),
      Error,
      'taxa de IVA 16%'
    );
    assertThrows(
      () => linhasDoPedido([{ descricao: 'x', quantidade: 0, preco_unitario: 10, taxa_iva: 23 }]),
      Error,
      'inválidos'
    );
    assertThrows(
      () => linhasDoPedido([{ descricao: 'x', quantidade: 1, preco_unitario: -1, taxa_iva: 23 }]),
      Error,
      'inválidos'
    );
    assertThrows(() => linhasDoPedido([]), Error, 'Sem linhas');
  }
);

Deno.test('NIF: tira espaços e o prefixo PT; vazio e consumidor final são null', () => {
  assertEquals(nifDoPedido(' PT 123 456 789 '), '123456789');
  assertEquals(nifDoPedido('999999990'), null);
  assertEquals(nifDoPedido(''), null);
  assertEquals(nifDoPedido(undefined), null);
});

Deno.test('pedido de fatura: ordem_id é a cobrança, total com IVA e FR leva o método', () => {
  const fa = pedidoDeFatura(
    {
      tipo: 'FA',
      cliente: {
        nome: ' Ana ',
        nif: '123456789',
        morada: 'Rua A',
        codigo_postal: '4000-001',
        localidade: 'Porto',
        email: 'a@b.pt',
      },
      itens,
      observacoes: 'Obs',
      referencia_externa: 'Contrato #1',
    },
    'cobranca-1',
    'mbway'
  );
  assertEquals(fa.ordem_id, 'cobranca-1');
  assertEquals(fa.tipo, 'FA');
  assertEquals(fa.total_esperado, 123);
  assertEquals(fa.cliente, {
    nif: '123456789',
    nome: 'Ana',
    morada: 'Rua A',
    cp: '4000-001',
    localidade: 'Porto',
    pais: 'PT',
    email: 'a@b.pt',
  });
  assertEquals(fa.observacoes, 'Obs | Contrato #1');
  assertEquals('metodo_pagamento' in fa, false);

  const fr = pedidoDeFatura({ tipo: 'FR', cliente: { nome: 'Ana' }, itens }, 'cobranca-2', 'mbway');
  assertEquals(fr.metodo_pagamento, 'mbway');
  // Consumidor final: o pedido não leva nif.
  assertEquals('nif' in fr.cliente, false);
});

Deno.test('total esperado respeita desconto e IVA por linha', () => {
  const p = pedidoDeFatura(
    {
      tipo: 'FA',
      cliente: { nome: 'Ana' },
      itens: [{ descricao: 'x', quantidade: 2, preco_unitario: 50, taxa_iva: 23, desconto: 10 }],
    },
    'c',
    'transferencia'
  );
  // 2 x 50 = 100, -10% = 90, +23% = 110,70
  assertEquals(p.total_esperado, 110.7);
});

const cfgTeste = {
  url: 'https://x.pt',
  ambiente: 'teste' as const,
  empresa: 'dasprent',
  metodoPagamento: 'transferencia' as const,
};
const cfgProd = { ...cfgTeste, ambiente: 'producao' as const };

Deno.test('trava de ambiente: teste só com fiscal false', () => {
  assertEquals(
    avaliarAmbiente({ ok: true, serie_comunicada: true, fiscal: false }, cfgTeste),
    null
  );
  assertStringIncludes(
    avaliarAmbiente({ ok: true, serie_comunicada: true, fiscal: true }, cfgTeste) ?? '',
    'marcada como teste'
  );
  // Sem o campo fiscal, em dúvida recusa.
  assertStringIncludes(
    avaliarAmbiente({ ok: true, serie_comunicada: true }, cfgTeste) ?? '',
    'Nada foi emitido'
  );
});

Deno.test('trava de ambiente: produção só com fiscal true e séries comunicadas', () => {
  const boa = {
    ok: true,
    serie_comunicada: true,
    fiscal: true,
    series: { FA: true, FR: true, NC: true, RE: true },
  };
  assertEquals(avaliarAmbiente(boa, cfgProd), null);
  assertStringIncludes(
    avaliarAmbiente({ ...boa, fiscal: false }, cfgProd) ?? '',
    'marcada como produção'
  );
  assertStringIncludes(
    avaliarAmbiente({ ...boa, fiscal: undefined }, cfgProd) ?? '',
    'não confirma valor fiscal'
  );
  assertStringIncludes(
    avaliarAmbiente({ ...boa, series: { FA: true, NC: false } }, cfgProd) ?? '',
    'séries'
  );
  assertStringIncludes(
    avaliarAmbiente({ ...boa, serie_comunicada: false }, cfgProd) ?? '',
    'séries'
  );
});

Deno.test('trava de ambiente: serviço não operacional nomeia a empresa', () => {
  const m = avaliarAmbiente({ ok: false, serie_comunicada: true }, cfgProd);
  assertStringIncludes(m ?? '', 'dasprent');
  assertStringIncludes(m ?? '', 'não está operacional');
});

Deno.test('acentos trocados do serviço de teste são reparados, texto normal não muda', () => {
  assertEquals(repararAcentos('NÃ£o permite'), 'Não permite');
  assertEquals(repararAcentos('Não permite'), 'Não permite');
});

Deno.test('falhas do serviço viram mensagens claras e dizem se repetir é seguro', () => {
  const total = falhaDoServico(422, {
    codigo: 'total_diferente',
    erro: 'x',
    total_primavera: 120.5,
  });
  assertStringIncludes(total.erro, '120.50');
  assertStringIncludes(total.erro, 'Nada foi emitido');

  assertStringIncludes(falhaDoServico(401, { codigo: 'chave_invalida', erro: 'x' }).erro, 'chave');
  assertStringIncludes(
    falhaDoServico(409, { codigo: 'serie_nao_comunicada', erro: 'x' }).erro,
    'AT'
  );
  assertStringIncludes(
    falhaDoServico(409, { codigo: 'ja_creditada', erro: 'x' }).erro,
    'creditada'
  );
  assertStringIncludes(
    falhaDoServico(422, { codigo: 'valor_superior_pendente', erro: 'x' }).erro,
    'recibo'
  );

  // código desconhecido: mostra o texto do serviço
  assertEquals(
    falhaDoServico(400, { codigo: 'outra', erro: 'Texto do serviço' }).erro,
    'Texto do serviço'
  );
  assertEquals(falhaDoServico(400, { codigo: 'outra' }).erro, 'O Primavera recusou o pedido.');

  // repetir: 5xx sim por omissão, 4xx não, e o que o serviço disser manda
  assertEquals(
    falhaDoServico(503, { codigo: 'servico_indisponivel', erro: 'x' }).tentarDeNovo,
    true
  );
  assertEquals(falhaDoServico(400, { codigo: 'pedido_invalido', erro: 'x' }).tentarDeNovo, false);
  assertEquals(
    falhaDoServico(503, { codigo: 'x', erro: 'x', tentar_de_novo: false }).tentarDeNovo,
    false
  );
  assertEquals(falhaDoServico(501, { codigo: 'nao_implementado', erro: 'x' }).tentarDeNovo, false);

  // empresa desconhecida: aponta para o código da empresa; 503 do serviço pede repetir
  assertStringIncludes(
    falhaDoServico(404, { codigo: 'empresa_inexistente', erro: 'x' }).erro,
    'código da empresa'
  );
  assertEquals(
    falhaDoServico(503, { codigo: 'servico_indisponivel', erro: 'x', tentar_de_novo: true })
      .tentarDeNovo,
    true
  );

  // resposta fora do combinado
  const m = falhaDoServico(502, 'texto solto');
  assertEquals(m.codigo, 'resposta_invalida');
  assertEquals(m.tentarDeNovo, true);
});
