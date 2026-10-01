import { describe, it, expect } from 'vitest';
import { linhaDanoDoFecho } from './useContratosRenting';

/**
 * Fechar o contrato renting #764 com danos rebentou com
 * "violates foreign key constraint viatura_danos_contrato_id_origem_fkey":
 * a linha levava o id do contrato renting em `contrato_id_origem`, cuja FK
 * aponta para `contratos` (tabela legada). O fecho inteiro falhava e o gestor
 * perdia o que tinha preenchido no terreno.
 */
describe('linhaDanoDoFecho', () => {
  const ctx = { viaturaId: 'v-1', contratoId: 'cr-764', motoristaId: 'm-1', userId: 'u-1' };
  const dano = { descricao: 'Parachoque', localizacao: 'frente_esq', valor: 120 };

  it('liga o dano ao contrato renting pela coluna certa', () => {
    expect(linhaDanoDoFecho(dano, ctx).contrato_renting_id).toBe('cr-764');
  });

  it('nunca escreve nas colunas com FK para a tabela legada `contratos`', () => {
    const linha = linhaDanoDoFecho(dano, ctx);
    expect(linha).not.toHaveProperty('contrato_id_origem');
    expect(linha).not.toHaveProperty('contrato_id');
  });

  it('nasce como existente — o estado que a ficha da viatura reconhece', () => {
    expect(linhaDanoDoFecho(dano, ctx).estado).toBe('existente');
  });

  it('valor por avaliar fica null, não 0', () => {
    expect(linhaDanoDoFecho({ ...dano, valor: null }, ctx).valor).toBeNull();
  });

  it('sem motorista fica null, não string vazia', () => {
    expect(linhaDanoDoFecho(dano, { ...ctx, motoristaId: '' }).motorista_id).toBeNull();
    expect(linhaDanoDoFecho(dano, { ...ctx, motoristaId: undefined }).motorista_id).toBeNull();
  });

  it('escreve só o que precisa de escrever', () => {
    expect(Object.keys(linhaDanoDoFecho(dano, ctx)).sort()).toEqual([
      'contrato_renting_id',
      'descricao',
      'estado',
      'localizacao',
      'motorista_id',
      'registado_por',
      'valor',
      'viatura_id',
    ]);
  });
});
