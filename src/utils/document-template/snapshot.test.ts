import { describe, expect, it } from 'vitest';

import { capturarSnapshot, dadosParaGerar, gerarDeSnapshot } from './snapshot';
import type { DocumentTemplate, GenerateDocumentParams } from './types';

/**
 * A fotografia dos dados de um documento.
 *
 * A promessa que se faz a quem assina é que o documento que ele assina é o
 * mesmo que recebeu. Um contrato pode ser enviado hoje e assinado daqui a uma
 * semana, e nesse intervalo o contrato pode ser alterado e o template editado.
 * Regerar a partir dos dados vivos faria a pessoa assinar coisa diferente da
 * que leu — por isso o documento nasce de uma fotografia congelada no envio.
 *
 * Estes testes são a prova dessa promessa. Se algum deles cair, a promessa
 * deixou de ser verdade.
 */

const QUANDO = '2026-08-25T10:00:00.000Z';

function templateDeTeste(conteudo: string): DocumentTemplate {
  return {
    id: 'tpl-1',
    nome: 'Contrato de Aluguer',
    tipo: 'contrato_aluguer',
    empresa_id: 'emp-1',
    papel_timbrado_url: null,
    template_data: { conteudo },
    campos_dinamicos: { motorista: [], empresa: [], documento: [] },
  };
}

function paramsDeTeste(): GenerateDocumentParams {
  return {
    templateId: 'tpl-1',
    motoristaData: { nome: 'Ana Reis' },
    documentData: { numero_contrato: '733' },
    skipOutput: true,
  };
}

describe('fotografia do documento', () => {
  it('a mesma fotografia produz sempre o mesmo documento', async () => {
    const snap = capturarSnapshot(
      paramsDeTeste(),
      templateDeTeste('<p>Contrato 733</p><p>{{assinatura_cliente}}</p>'),
      QUANDO
    );

    const primeiro = await gerarDeSnapshot(snap, {});
    const segundo = await gerarDeSnapshot(snap, {});

    expect(segundo.output('datauristring')).toBe(primeiro.output('datauristring'));
  });

  it('editar o template depois do envio não muda o documento', async () => {
    const template = templateDeTeste('<p>Versão enviada</p>');
    const snap = capturarSnapshot(paramsDeTeste(), template, QUANDO);
    const antes = await gerarDeSnapshot(snap, {});

    // Alguém edita o template no painel de administração.
    template.template_data.conteudo = '<p>Versão editada depois</p>';

    const depois = await gerarDeSnapshot(snap, {});

    expect(depois.output('datauristring')).toBe(antes.output('datauristring'));
  });

  it('alterar os dados depois do envio não muda o documento', async () => {
    const params = paramsDeTeste();
    const snap = capturarSnapshot(params, templateDeTeste('<p>{{numero_contrato}}</p>'), QUANDO);
    const antes = await gerarDeSnapshot(snap, {});

    // Alguém mexe no contrato entretanto.
    params.documentData!.numero_contrato = '999';

    const depois = await gerarDeSnapshot(snap, {});

    expect(depois.output('datauristring')).toBe(antes.output('datauristring'));
  });

  /**
   * A assinatura chega ao documento, mas o desenho da imagem não se afirma
   * aqui: o gerador carrega imagens com `new Image()` e o `onload` nunca dispara
   * fora de um browser a sério. Um teste que comparasse os bytes do PDF com e
   * sem assinatura passaria a dizer que a assinatura não aparece — e isso é
   * falso no browser, onde as fotografias das folhas de danos aparecem todos os
   * dias. Verifica-se o que é verificável: que a assinatura entra nos dados com
   * que o documento é desenhado. O marcador virar imagem está coberto em
   * `parser.assinaturas.test.ts`.
   */
  it('a assinatura entra nos dados com que o documento é desenhado', () => {
    const snap = capturarSnapshot(
      paramsDeTeste(),
      templateDeTeste('<p>{{assinatura_cliente}}</p>'),
      QUANDO
    );

    expect(dadosParaGerar(snap, {}).assinatura_cliente).toBeUndefined();

    const comAssinatura = dadosParaGerar(snap, {
      assinatura_cliente: 'data:image/png;base64,iVBORw0KGgo=',
    });

    expect(comAssinatura.assinatura_cliente).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(comAssinatura.numero_contrato).toBe('733');
  });

  it('descarta assinaturas de quem vai assinar e guarda a de quem gerou', () => {
    const params = paramsDeTeste();
    params.documentData!.assinatura_cliente = 'data:image/png;base64,cliente';
    params.documentData!.assinatura_condutor = 'data:image/png;base64,condutor';
    params.documentData!.assinatura_colaborador = 'data:image/png;base64,colaborador';

    const snap = capturarSnapshot(params, templateDeTeste('<p>x</p>'), QUANDO);

    // Quem assina pelo link só assina no momento em que assina. Uma assinatura
    // que viesse de trás punha no documento uma assinatura que a pessoa não fez.
    expect(snap.documentData.assinatura_cliente).toBeUndefined();
    expect(snap.documentData.assinatura_condutor).toBeUndefined();

    // A de quem gerou o documento faz parte do documento tal como foi enviado.
    expect(snap.documentData.assinatura_colaborador).toBe('data:image/png;base64,colaborador');
  });
});
