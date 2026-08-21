import { describe, expect, it } from 'vitest';

import {
  COR_DEVOLUCAO,
  COR_ENTREGA,
  COR_NEUTRA,
  COR_RECOLHA,
  TAMANHO_MOMENTO_PT,
  corDoMomentoFolha,
  momentoFolhaHtml,
} from './momentoFolhaCor';

describe('corDoMomentoFolha', () => {
  it('pinta cada momento com a sua cor', () => {
    expect(corDoMomentoFolha('ENTREGA')).toBe(COR_ENTREGA);
    expect(corDoMomentoFolha('RECOLHA')).toBe(COR_RECOLHA);
    expect(corDoMomentoFolha('DEVOLUÇÃO')).toBe(COR_DEVOLUCAO);
  });

  it('aceita as duas grafias de devolução — ambas circulam no código', () => {
    expect(corDoMomentoFolha('DEVOLUCAO')).toBe(COR_DEVOLUCAO);
    expect(corDoMomentoFolha('Devolução')).toBe(COR_DEVOLUCAO);
  });

  it('ignora caixa e espaços', () => {
    expect(corDoMomentoFolha('  entrega ')).toBe(COR_ENTREGA);
  });

  it('momento desconhecido ou vazio sai a preto, não rebenta', () => {
    expect(corDoMomentoFolha('QUALQUER COISA')).toBe(COR_NEUTRA);
    expect(corDoMomentoFolha('')).toBe(COR_NEUTRA);
    expect(corDoMomentoFolha(null)).toBe(COR_NEUTRA);
    expect(corDoMomentoFolha(undefined)).toBe(COR_NEUTRA);
  });

  it('recolha e devolução têm de ser cores DIFERENTES', () => {
    // O ponto todo desta funcionalidade: distinguir num relance a viatura que
    // fomos buscar da que o motorista trouxe.
    expect(corDoMomentoFolha('RECOLHA')).not.toBe(corDoMomentoFolha('DEVOLUÇÃO'));
  });
});

describe('momentoFolhaHtml', () => {
  it('embrulha o momento num strong com cor e tamanho inline', () => {
    expect(momentoFolhaHtml('RECOLHA')).toBe(
      `<strong style="color:${COR_RECOLHA};font-size:${TAMANHO_MOMENTO_PT}px">RECOLHA</strong>`
    );
  });

  it('preserva o texto tal como veio — é o que sai impresso', () => {
    expect(momentoFolhaHtml('DEVOLUÇÃO')).toContain('>DEVOLUÇÃO<');
  });

  it('sem momento não produz span nenhum', () => {
    expect(momentoFolhaHtml('')).toBe('');
    expect(momentoFolhaHtml(null)).toBe('');
  });

  it('vem a NEGRITO — <strong> é o que liga o bold no parser', () => {
    expect(momentoFolhaHtml('ENTREGA')).toMatch(/^<strong/);
  });

  it('vem maior que o resto do título, que sai a 10pt por omissão', () => {
    expect(TAMANHO_MOMENTO_PT).toBeGreaterThan(10);
    expect(momentoFolhaHtml('DEVOLUÇÃO')).toContain('font-size:' + TAMANHO_MOMENTO_PT + 'px');
  });
});
