import { describe, it, expect } from 'vitest';
import { descricaoGuardado } from './useContratosRenting';

/**
 * O aviso de gravação passa a dizer o valor que FICOU gravado — o que veio de
 * volta da base de dados, não o que estava no ecrã. É a diferença entre
 * "guardei" e "guardei isto", e é o que torna visível no momento uma
 * divergência que até aqui só se descobria a reabrir o contrato.
 *
 * O Intl separa o número do € com espaço não-quebrável, e o carácter exacto
 * varia entre versões do ICU. Comparar o texto cru tornava estes testes frágeis
 * por uma razão que nada tem que ver com o que se quer garantir.
 */
const NBSP = String.fromCharCode(160);
const normalizar = (s: string) => s.split(NBSP).join(' ');

describe('descricaoGuardado', () => {
  it('mostra o total que ficou gravado', () => {
    expect(normalizar(descricaoGuardado(720))).toBe(
      'As alterações foram guardadas. Total: 720,00 €.'
    );
  });

  it('mostra os cêntimos, que é onde as divergências costumam aparecer', () => {
    expect(normalizar(descricaoGuardado(224.99))).toBe(
      'As alterações foram guardadas. Total: 224,99 €.'
    );
  });

  it('zero é um valor gravado como outro qualquer, não uma ausência', () => {
    expect(normalizar(descricaoGuardado(0))).toBe('As alterações foram guardadas. Total: 0,00 €.');
  });

  // Contratos sem preço manual (o valor sai da tarifa): não inventa um total.
  it('sem valor manual não promete total nenhum', () => {
    expect(descricaoGuardado(null)).toBe('As alterações foram guardadas.');
    expect(descricaoGuardado(undefined)).toBe('As alterações foram guardadas.');
  });
});
