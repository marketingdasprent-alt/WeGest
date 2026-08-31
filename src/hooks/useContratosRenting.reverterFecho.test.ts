import { describe, it, expect } from 'vitest';
import { patchContratoAoReverterFecho } from './useContratosRenting';

/**
 * Reverter um fecho tem de desfazer TUDO o que o fecho afirmou.
 *
 * O bug: repunha só o estado. O `tipo_fecho` ficava lá, e o contrato passava a
 * dizer ao mesmo tempo "está em curso" e "foi devolvido". Como a viatura só
 * conta o ESTADO para saber se está ocupada, ela voltava a ficar presa ao
 * contrato — e a única forma de os dois campos voltarem a concordar era
 * reverter e fechar outra vez.
 *
 * Aconteceu em produção nos contratos #713, #473 e #441, todos depois de as
 * correcções do fecho de 20-24/08 já estarem aplicadas.
 */
describe('patchContratoAoReverterFecho', () => {
  const patch = patchContratoAoReverterFecho('user-1');

  it('devolve o contrato a em curso', () => {
    expect(patch.estado_operacional).toBe('em_curso');
  });

  it('apaga como o contrato acabou — porque deixou de ter acabado', () => {
    expect(patch.tipo_fecho).toBeNull();
  });

  // Sem isto, a DUA ficava dada como devolvida num contrato que voltou a estar
  // a decorrer, e o aviso de que ela esta com o motorista nunca mais aparecia.
  it('reabre o ciclo da DUA', () => {
    expect(patch.dua_devolvida_em).toBeNull();
  });

  it('regista quem reverteu', () => {
    expect(patch.updated_by).toBe('user-1');
  });

  /**
   * A fronteira que interessa: apagam-se os factos ADMINISTRATIVOS do fecho,
   * nunca os FÍSICOS. Quem reverte um fecho para corrigir uma data não pode
   * perder os quilómetros medidos nem as fotos dos danos. E a estação de
   * recolha fica porque não sabemos qual era antes — apagá-la destruía uma
   * escolha legítima.
   */
  it('não toca no que foi medido na recolha', () => {
    expect(patch).not.toHaveProperty('km_entrada');
    expect(patch).not.toHaveProperty('combustivel_entrada');
    expect(patch).not.toHaveProperty('eletricidade_entrada');
    expect(patch).not.toHaveProperty('estacao_recolha_id');
  });

  it('escreve só o que precisa de escrever', () => {
    expect(Object.keys(patch).sort()).toEqual([
      'dua_devolvida_em',
      'estado_operacional',
      'tipo_fecho',
      'updated_by',
    ]);
  });
});
