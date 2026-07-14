import { describe, expect, it } from 'vitest';
import { htmlToText } from './parser';

describe('htmlToText', () => {
  it('não cola o texto de um parágrafo ao elemento anterior quando há um parágrafo em branco entre eles', () => {
    // Reproduz o bug real: título (bold, centrado) + parágrafo espaçador
    // "&nbsp;" + parágrafo com um nome em bold (justificado). O nome não pode
    // aparecer colado ao título, mesmo os dois sendo bold — pertencem a
    // parágrafos diferentes, com alinhamentos diferentes.
    const html =
      '<h1 style="text-align: center;"><strong>TÍTULO</strong></h1>' +
      '<p><strong>&nbsp;</strong></p>' +
      '<p style="text-align: justify;"><strong>TESTE EXEMPLO DA SILVA</strong>, com domicílio em RUA X</p>';

    const elements = htmlToText(html);
    const textos = elements.map((e) => e.text);

    expect(textos).not.toContain('TÍTULOTESTE EXEMPLO DA SILVA');
    expect(textos).toContain('TÍTULO');
    expect(textos).toContain('TESTE EXEMPLO DA SILVA');

    // O nome mantém o alinhamento do SEU parágrafo (justify), não o do título (center).
    const nomeEl = elements.find((e) => e.text === 'TESTE EXEMPLO DA SILVA');
    expect(nomeEl?.style?.align).toBe('justify');
  });

  it('preserva o espaço entre dois runs de estilo diferente na mesma frase', () => {
    // "PARA" normal + espaço isolado (nó de texto próprio) + "INSCRIÇÃO" bold —
    // padrão comum de colar/editar no TipTap que produz um nó só com espaço.
    const html = '<p>PARA <strong>INSCRIÇÃO</strong></p>';
    const elements = htmlToText(html);
    const junto = elements.map((e) => e.text).join('');
    expect(junto).toContain('PARA INSCRIÇÃO');
    expect(junto).not.toContain('PARAINSCRIÇÃO');
  });

  it('não junta dois parágrafos de texto consecutivos com o mesmo alinhamento', () => {
    const html = '<p>Primeiro parágrafo.</p><p>Segundo parágrafo.</p>';
    const elements = htmlToText(html);
    const textos = elements.map((e) => e.text);
    expect(textos).not.toContain('Primeiro parágrafo.Segundo parágrafo.');
    expect(textos).toContain('Primeiro parágrafo.');
    expect(textos).toContain('Segundo parágrafo.');
  });

  it('um parágrafo vazio ("&nbsp;") não produz texto, só a quebra de linha', () => {
    const html = '<p>&nbsp;</p>';
    const elements = htmlToText(html);
    expect(elements.every((e) => e.type !== 'text' || e.text === '\n')).toBe(true);
  });
});
