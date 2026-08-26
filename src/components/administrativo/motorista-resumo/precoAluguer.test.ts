// Testes do cálculo PARTILHADO entre a aplicação e as edge functions.
// O ficheiro vive em supabase/functions/_shared/resumo/ e chega aqui pelo
// alias `@shared` — se este import partir, é porque a partilha partiu.
import { describe, it, expect } from 'vitest';
import { resolverPrecoAluguer, precoACobrar, type TabelasDePreco } from '@shared/precoAluguer.ts';

const tabelas: TabelasDePreco = {
  porTarifaEModelo: new Map([['tarifa-tvde|modelo-a', 224.99]]),
  porTarifa: new Map([['tarifa-grupo', 300]]),
  porGrupo: new Map([['grupo-1', 250]]),
  porModelo: new Map([['modelo-a', 210]]),
};

describe('resolverPrecoAluguer — a cascata', () => {
  it('o contrato manda sobre tudo o resto', () => {
    const r = resolverPrecoAluguer(
      { preco_semana_acordado: 275, tarifa_id: 'tarifa-tvde' },
      { grupo_id: 'grupo-1', modelo_id: 'modelo-a' },
      tabelas
    );
    expect(r).toEqual({ precoSemana: 275, origem: 'contrato', estimado: false });
  });

  it('preço alterado à mão no contrato prevalece sobre a tarifa', () => {
    // Caso real: contrato a 275,00 e tarifa do modelo a 224,99.
    const r = resolverPrecoAluguer(
      { preco_semana_acordado: 275, tarifa_id: 'tarifa-tvde' },
      { modelo_id: 'modelo-a' },
      tabelas
    );
    expect(r.precoSemana).toBe(275);
    expect(r.estimado).toBe(false);
  });

  it('sem preço no contrato, usa a tarifa QUE O CONTRATO indica, por modelo', () => {
    const r = resolverPrecoAluguer(
      { tarifa_id: 'tarifa-tvde' },
      { grupo_id: 'grupo-1', modelo_id: 'modelo-a' },
      tabelas
    );
    expect(r).toEqual({ precoSemana: 224.99, origem: 'tarifa-do-contrato', estimado: false });
  });

  it('tarifa do contrato sem preço por modelo cai na tarifa de grupo do próprio contrato', () => {
    const r = resolverPrecoAluguer(
      { tarifa_id: 'tarifa-grupo' },
      { modelo_id: 'modelo-a' },
      tabelas
    );
    expect(r).toEqual({ precoSemana: 300, origem: 'tarifa-do-contrato', estimado: false });
  });

  it('sem contrato que resolva, o recurso pelo grupo vai marcado como ESTIMADO', () => {
    const r = resolverPrecoAluguer(null, { grupo_id: 'grupo-1', modelo_id: 'modelo-a' }, tabelas);
    expect(r).toEqual({ precoSemana: 250, origem: 'grupo-da-viatura', estimado: true });
  });

  it('último recurso: tarifa TVDE por modelo, também estimado', () => {
    const r = resolverPrecoAluguer(null, { modelo_id: 'modelo-a' }, tabelas);
    expect(r).toEqual({ precoSemana: 210, origem: 'modelo-tvde', estimado: true });
  });

  it('sem nada de onde tirar devolve null — nunca 0', () => {
    const r = resolverPrecoAluguer(null, { modelo_id: 'desconhecido' }, tabelas);
    expect(r.precoSemana).toBeNull();
    expect(r.origem).toBe('sem-preco');
  });

  it('um preço de 0 no contrato é um preço, não uma ausência', () => {
    // Viatura cedida ou campanha. Antes disto, o 0 caía na cascata e o
    // sistema inventava a tarifa do grupo.
    const r = resolverPrecoAluguer(
      { preco_semana_acordado: 0, tarifa_id: 'tarifa-tvde' },
      { grupo_id: 'grupo-1' },
      tabelas
    );
    expect(r.precoSemana).toBe(0);
    expect(r.origem).toBe('contrato');
    expect(r.estimado).toBe(false);
  });

  it('aceita o preço em texto, como vem do PostgREST', () => {
    const r = resolverPrecoAluguer({ preco_semana_acordado: '224.99' }, null, tabelas);
    expect(r.precoSemana).toBeCloseTo(224.99, 6);
  });

  it('sem tabelas nenhumas não rebenta', () => {
    expect(resolverPrecoAluguer({ tarifa_id: 't' }, { modelo_id: 'm' }).precoSemana).toBeNull();
  });
});

describe('precoACobrar — sem contrato activo não se cobra', () => {
  it('sem contrato activo devolve null e marca por regularizar', () => {
    const r = precoACobrar(false, { preco_semana_acordado: 275 }, { grupo_id: 'grupo-1' }, tabelas);
    expect(r.precoSemana).toBeNull();
    expect(r.porRegularizar).toBe(true);
  });

  it('null não é zero — quem chama tem de distinguir "por regularizar" de "não deve nada"', () => {
    const r = precoACobrar(false, null, null, tabelas);
    expect(r.precoSemana).not.toBe(0);
    expect(r.precoSemana).toBeNull();
  });

  it('com contrato activo e preço, cobra e não marca nada', () => {
    const r = precoACobrar(true, { preco_semana_acordado: 275 }, null, tabelas);
    expect(r.precoSemana).toBe(275);
    expect(r.porRegularizar).toBe(false);
    expect(r.estimado).toBe(false);
  });

  it('com contrato activo mas sem preço nenhum, fica por regularizar', () => {
    const r = precoACobrar(true, { tarifa_id: 'inexistente' }, { modelo_id: 'nenhum' }, tabelas);
    expect(r.precoSemana).toBeNull();
    expect(r.porRegularizar).toBe(true);
  });
});
