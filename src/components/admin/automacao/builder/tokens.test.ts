import { describe, it, expect } from 'vitest';
import {
  extrairTokens,
  inserirToken,
  paresDoPayload,
  substituirTokens,
  sugestoesDeToken,
  tokensUsados,
} from './tokens';

/**
 * A pré-visualização só vale se substituir EXACTAMENTE como o servidor.
 *
 * O `renderTemplate` das edge functions é
 *   /\{\{\s*(\w+)\s*\}\}/g  →  valor ?? ''
 * `\w+` não apanha pontos: `{{motorista.nome}}` nunca é substituído lá. Se
 * aqui fosse, a pré-visualização mostrava um email que nunca vai existir.
 */
describe('substituirTokens', () => {
  it('substitui o token pelo valor', () => {
    expect(substituirTokens('Olá {{nome}}', { nome: 'Ana' })).toBe('Olá Ana');
  });

  it('aceita espaços dentro das chavetas, como o servidor', () => {
    expect(substituirTokens('{{ nome }}', { nome: 'Ana' })).toBe('Ana');
  });

  it('token sem valor fica vazio, não fica literal', () => {
    expect(substituirTokens('Olá {{nome}}!', {})).toBe('Olá !');
    expect(substituirTokens('{{nome}}', { nome: null })).toBe('');
  });

  it('NÃO substitui campos com ponto — o servidor também não', () => {
    const texto = '{{motorista.nome}}';
    expect(substituirTokens(texto, { 'motorista.nome': 'Ana' })).toBe(texto);
  });

  it('substitui todas as ocorrências, não só a primeira', () => {
    expect(substituirTokens('{{a}} e {{a}}', { a: 'x' })).toBe('x e x');
  });
});

describe('extrairTokens', () => {
  it('devolve os campos usados, sem repetir', () => {
    expect(extrairTokens('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });

  it('texto sem tokens devolve lista vazia', () => {
    expect(extrairTokens('sem nada')).toEqual([]);
  });
});

describe('paresDoPayload', () => {
  it('achata o payload em pares campo/valor', () => {
    const pares = paresDoPayload({ nome: 'Ana', dias: 3 });

    expect(pares).toEqual([
      { campo: 'dias', valor: '3', inserivel: true },
      { campo: 'nome', valor: 'Ana', inserivel: true },
    ]);
  });

  it('campo aninhado aparece mas não é inserível', () => {
    // Mostrá-lo é útil para perceber o payload; deixá-lo arrastar para o texto
    // dava um token que o servidor nunca substitui.
    const pares = paresDoPayload({ viatura: { marca: 'VW' } });

    expect(pares[0]).toMatchObject({ campo: 'viatura', inserivel: false });
    expect(pares[0].valor).toContain('VW');
  });

  it('payload vazio ou inválido devolve lista vazia', () => {
    expect(paresDoPayload({})).toEqual([]);
    expect(paresDoPayload(null)).toEqual([]);
    expect(paresDoPayload('texto')).toEqual([]);
  });

  it('null e booleanos aparecem legíveis', () => {
    const pares = paresDoPayload({ a: null, b: false });
    expect(pares.map((p) => p.valor)).toEqual(['—', 'false']);
  });
});

describe('sugestoesDeToken', () => {
  const campos = ['nome', 'matricula', 'dias'];

  it('abre depois de escrever chaveta dupla', () => {
    const r = sugestoesDeToken('Olá {{', 6, campos);

    expect(r.activo).toBe(true);
    expect(r.sugestoes).toEqual(campos);
  });

  it('filtra à medida que se escreve', () => {
    const r = sugestoesDeToken('Olá {{ma', 8, campos);

    expect(r.sugestoes).toEqual(['matricula']);
  });

  it('fecha depois de o token estar fechado', () => {
    expect(sugestoesDeToken('{{nome}} ', 9, campos).activo).toBe(false);
  });

  it('não abre sem as duas chavetas', () => {
    expect(sugestoesDeToken('Olá {', 5, campos).activo).toBe(false);
  });
});

describe('inserirToken', () => {
  it('completa o token começado e põe o cursor a seguir', () => {
    const r = inserirToken('Olá {{ma', 8, 'matricula');

    expect(r.texto).toBe('Olá {{matricula}}');
    expect(r.cursor).toBe(r.texto.length);
  });

  it('sem token começado insere um completo na posição do cursor', () => {
    const r = inserirToken('Olá  fim', 4, 'nome');

    expect(r.texto).toBe('Olá {{nome}} fim');
  });
});

describe('tokensUsados', () => {
  it('lista os campos que o texto usa, sem repetir', () => {
    const r = tokensUsados('Olá {{nome}}, o {{estado}} de {{nome}}', null);

    expect(r.usados).toEqual(['nome', 'estado']);
  });

  it('sem payload NÃO acusa nenhum de desconhecido', () => {
    // A regra pode nunca ter corrido. Marcar tudo a vermelho por não haver
    // amostra era um alarme falso garantido.
    const r = tokensUsados('{{nome}} {{seja_o_que_for}}', null);

    expect(r.usados).toHaveLength(2);
    expect(r.desconhecidos).toEqual([]);
  });

  it('com payload, acusa os que não existem lá', () => {
    const r = tokensUsados('{{nome}} e {{inventado}}', { nome: 'Ana', email: 'a@x.pt' });

    expect(r.desconhecidos).toEqual(['inventado']);
  });

  it('um campo que existe no payload não é acusado, mesmo estando vazio', () => {
    // Valor vazio é legítimo; o que interessa é a chave existir.
    const r = tokensUsados('{{nota}}', { nota: '' });

    expect(r.desconhecidos).toEqual([]);
  });

  it('texto sem tokens não devolve nada', () => {
    expect(tokensUsados('sem campos nenhuns', { nome: 'Ana' })).toEqual({
      usados: [],
      desconhecidos: [],
    });
  });
});
