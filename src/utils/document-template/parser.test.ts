import { describe, expect, it } from 'vitest';
import { htmlToText } from './parser';
import { COR_RECOLHA, TAMANHO_MOMENTO_PT, momentoFolhaHtml } from './momentoFolhaCor';

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

  it('converte a quebra de página do editor num elemento "pagebreak"', () => {
    const html =
      '<p>Página um.</p>' +
      '<div data-page-break="true" class="page-break"></div>' +
      '<p>Página dois.</p>';

    const elements = htmlToText(html);
    const tipos = elements.map((e) => e.type);

    expect(tipos).toContain('pagebreak');
    // Entre os dois parágrafos, e uma só vez.
    expect(tipos.filter((t) => t === 'pagebreak')).toHaveLength(1);
    const idxQuebra = elements.findIndex((e) => e.type === 'pagebreak');
    expect(elements.findIndex((e) => e.text === 'Página um.')).toBeLessThan(idxQuebra);
    expect(elements.findIndex((e) => e.text === 'Página dois.')).toBeGreaterThan(idxQuebra);
  });

  it('a decoração da quebra de página nunca chega ao documento', () => {
    // O nó guardado tem um rótulo só para o editor ("Página" + contador CSS).
    const html =
      '<div data-page-break="true" class="page-break" contenteditable="false">' +
      '<span class="page-break-label">Página</span>' +
      '</div>';

    const elements = htmlToText(html);

    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe('pagebreak');
    expect(elements.map((e) => e.text).join('')).not.toContain('Página');
  });
});

describe('htmlToText — cor', () => {
  it('não cola um run colorido ao run preto anterior', () => {
    // O título da Folha de Danos: texto normal + o momento colorido. Os dois
    // runs têm o mesmo bold e o mesmo alinhamento, e o merge colava-os —
    // o segundo perdia a cor e a folha saía toda preta.
    const html =
      '<h1 style="text-align:center">FOLHA DE REGISTO DE DANOS — ' +
      '<span style="color:#C0392B">RECOLHA</span></h1>';

    const els = htmlToText(html).filter(
      (e) => e.type === 'text' && e.text !== String.fromCharCode(10)
    );

    expect(els).toHaveLength(2);
    expect(els[0].text).toContain('FOLHA DE REGISTO DE DANOS');
    expect(els[0].style.color).toBeUndefined();
    expect(els[1].text).toBe('RECOLHA');
    expect(els[1].style.color).toEqual([192, 57, 43]);
  });

  it('continua a colar runs da mesma cor — o merge não se perdeu', () => {
    const html =
      '<p><span style="color:#C0392B">DOIS </span>' + '<span style="color:#C0392B">RUNS</span></p>';

    const els = htmlToText(html).filter(
      (e) => e.type === 'text' && e.text !== String.fromCharCode(10)
    );

    expect(els).toHaveLength(1);
    expect(els[0].text).toBe('DOIS RUNS');
  });
});

describe('htmlToText — momento da folha de danos', () => {
  it('o momento chega ao PDF a negrito, colorido e maior', () => {
    // Prova o HTML REAL que momentoFolhaHtml produz, e não uma imitação:
    // negrito, cor e tamanho vêm de caminhos diferentes no parser (a tag liga
    // o bold, os estilos inline dão cor e tamanho) e todos têm de sobreviver.
    const html =
      '<h1 style="text-align:center">FOLHA DE REGISTO DE DANOS — ' +
      momentoFolhaHtml('RECOLHA') +
      '</h1>';

    const els = htmlToText(html).filter(
      (e) => e.type === 'text' && e.text !== String.fromCharCode(10)
    );
    const momento = els.find((e) => e.text.includes('RECOLHA'));

    expect(momento).toBeDefined();
    expect(momento!.style.bold).toBe(true);
    expect(momento!.style.color).toEqual([213, 0, 0]);
    expect(momento!.style.fontSize).toBe(TAMANHO_MOMENTO_PT);
    // e o texto antes continua preto e no tamanho normal
    const antes = els.find((e) => e.text.includes('FOLHA DE REGISTO'));
    expect(antes!.style.color).toBeUndefined();
    expect(COR_RECOLHA).toBe('#D50000');
  });
});
