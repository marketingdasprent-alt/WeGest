import { describe, it, expect } from 'vitest';
import { hslDoToken, TOKENS_DO_CANVAS } from './coresDoCanvas';

/**
 * O Background, o MiniMap e os marcadores de seta do React Flow recebem a cor
 * por prop JavaScript — não lêem variáveis CSS. Daí ser preciso ler o valor
 * computado e convertê-lo. É aqui que se garante que uma leitura falhada não
 * deixa o canvas sem cor nenhuma.
 */
describe('hslDoToken', () => {
  it('embrulha os três componentes numa cor hsl utilizável', () => {
    expect(hslDoToken('222 47% 6%', 'hsl(0 0% 0%)')).toBe('hsl(222 47% 6%)');
  });

  it('token por ler cai para o recurso em vez de devolver hsl() vazio', () => {
    // getComputedStyle devolve '' para custom properties antes do CSS montar,
    // e `hsl()` sem argumentos pinta transparente — o canvas ficava sem grelha.
    expect(hslDoToken('', 'hsl(0 0% 50%)')).toBe('hsl(0 0% 50%)');
    expect(hslDoToken('   ', 'hsl(0 0% 50%)')).toBe('hsl(0 0% 50%)');
  });

  it('ignora o espaço em volta que o getComputedStyle deixa', () => {
    expect(hslDoToken('  215 16% 47%  ', 'x')).toBe('hsl(215 16% 47%)');
  });

  it('valor que já é uma cor completa passa intacto', () => {
    // Evita gerar hsl(hsl(...)) se algum dia um token guardar a cor inteira.
    expect(hslDoToken('hsl(210 40% 98%)', 'x')).toBe('hsl(210 40% 98%)');
    expect(hslDoToken('#334155', 'x')).toBe('#334155');
  });

  it('a lista de tokens cobre os três consumidores por prop', () => {
    expect(TOKENS_DO_CANVAS).toMatchObject({
      grelha: '--grid-dot',
      aresta: '--edge',
      painel: '--panel-bg',
      no: '--node-bg',
      borda: '--node-border',
    });
  });
});
