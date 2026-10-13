import { describe, expect, it } from 'vitest';
import { rotaNovoTicketDaViatura, viaturaPedida } from './novoTicketAssistencia';

const viaturas = [
  { id: 'v-1', matricula: '00-62-VF' },
  { id: 'v-2', matricula: 'BM-52-OQ' },
];

describe('novo ticket de assistência a partir da viatura', () => {
  it('o botão leva ao novo ticket com a viatura no endereço', () => {
    expect(rotaNovoTicketDaViatura('v-1')).toBe('/assistencia/nova?viatura_id=v-1');
  });

  it('o novo ticket encontra a viatura pedida', () => {
    const params = new URLSearchParams('viatura_id=v-2');
    expect(viaturaPedida(params, viaturas)?.matricula).toBe('BM-52-OQ');
  });

  it('sem viatura no endereço, escolhe-se à mão', () => {
    expect(viaturaPedida(new URLSearchParams(), viaturas)).toBeNull();
  });

  it('uma viatura que não está na lista (ex.: vendida) não é escolhida', () => {
    expect(viaturaPedida(new URLSearchParams('viatura_id=v-9'), viaturas)).toBeNull();
  });
});
