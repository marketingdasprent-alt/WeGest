import { describe, expect, it } from 'vitest';
import { deveIgnorarAtalho } from './atalhosDoCanvas';

/**
 * Backspace/Delete/Ctrl+Z são do canvas — apagam o nó seleccionado, desfazem
 * a última alteração — MAS só quando o foco não está num controlo próprio.
 * Sem cobrir `button`/chips, clicar em "Guardar" ou no "x" de um cargo e
 * carregar em Backspace por hábito apagava o nó em edição.
 */
describe('deveIgnorarAtalho', () => {
  it('ignora um campo de texto', () => {
    const input = document.createElement('input');
    expect(deveIgnorarAtalho(input)).toBe(true);
  });

  it('ignora um botão — "Guardar", "Cancelar", "Testar"', () => {
    const botao = document.createElement('button');
    expect(deveIgnorarAtalho(botao)).toBe(true);
  });

  it('ignora um elemento DENTRO de um botão — o ícone do "x" de um chip', () => {
    const botao = document.createElement('button');
    const icone = document.createElement('svg');
    botao.appendChild(icone);
    expect(deveIgnorarAtalho(icone)).toBe(true);
  });

  it('ignora um select', () => {
    const select = document.createElement('select');
    expect(deveIgnorarAtalho(select)).toBe(true);
  });

  it('não ignora o canvas — um nó seleccionado continua a apagar-se', () => {
    const canvas = document.createElement('div');
    expect(deveIgnorarAtalho(canvas)).toBe(false);
  });

  it('não ignora quando não há alvo nenhum', () => {
    expect(deveIgnorarAtalho(null)).toBe(false);
  });
});
