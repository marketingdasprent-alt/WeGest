import { describe, expect, it } from 'vitest';

import { replaceDynamicFields } from './parser';

/**
 * Marcadores de assinatura nos templates.
 *
 * O parser já tratava do colaborador (quem gera o documento), do motorista e do
 * responsável. Faltavam o cliente e o condutor, que são quem assina do outro
 * lado quando o documento é enviado para assinatura.
 *
 * O caso do espaço vazio é tão importante como o da imagem: um contrato
 * impresso para assinar à mão tem de sair com o espaço em branco, e nunca com o
 * marcador escrito à letra no meio da página. O parser substitui a partir de uma
 * lista fixa — um marcador que ele não conheça fica no documento tal e qual.
 */
describe('marcadores de assinatura', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';

  it('desenha a assinatura do cliente quando há imagem', () => {
    const out = replaceDynamicFields(
      '<p>{{assinatura_cliente}}</p>',
      {},
      { assinatura_cliente: png }
    );

    expect(out).toContain('class="sig-cliente"');
    expect(out).toContain(png);
  });

  it('desenha a assinatura do condutor quando há imagem', () => {
    const out = replaceDynamicFields(
      '<p>{{assinatura_condutor}}</p>',
      {},
      { assinatura_condutor: png }
    );

    expect(out).toContain('class="sig-condutor"');
    expect(out).toContain(png);
  });

  it('deixa o espaço vazio quando não há assinatura do cliente', () => {
    const out = replaceDynamicFields('<p>{{assinatura_cliente}}</p>', {}, {});

    expect(out).toBe('<p></p>');
  });

  it('deixa o espaço vazio quando não há assinatura do condutor', () => {
    const out = replaceDynamicFields('<p>{{assinatura_condutor}}</p>', {}, {});

    expect(out).toBe('<p></p>');
  });

  it('ignora valores que não sejam imagens', () => {
    const out = replaceDynamicFields(
      '<p>{{assinatura_cliente}}</p>',
      {},
      { assinatura_cliente: 'https://exemplo.pt/assinatura.png' }
    );

    expect(out).toBe('<p></p>');
  });

  it('escapa aspas no conteúdo da imagem', () => {
    const out = replaceDynamicFields(
      '<p>{{assinatura_condutor}}</p>',
      {},
      { assinatura_condutor: 'data:image/png;base64,aa"bb' }
    );

    expect(out).toContain('&quot;');
    expect(out).not.toContain('aa"bb');
  });

  it('não mexe nos marcadores que já existiam', () => {
    const out = replaceDynamicFields(
      '<p>{{assinatura_colaborador}}{{assinatura_motorista}}{{assinatura_responsavel}}</p>',
      {},
      { assinatura_colaborador: png }
    );

    expect(out).toContain('class="sig-colaborador"');
    expect(out).not.toContain('{{assinatura_motorista}}');
    expect(out).not.toContain('{{assinatura_responsavel}}');
  });
});
