// Testes do cálculo PARTILHADO entre a aplicação e as edge functions.
// O ficheiro vive em supabase/functions/_shared/resumo/ e chega aqui pelo
// alias `@shared` — se este import partir, é porque a partilha partiu.
import { describe, it, expect } from 'vitest';
import {
  resolverPrecoAluguer,
  precoACobrar,
  precoSemanalTvde,
  type TabelasDePreco,
} from '@shared/precoAluguer.ts';

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

describe('precoSemanalTvde — o que o fecho cobra', () => {
  const tvde = { regime: 'tvde' };

  it('o acordado ganha à tarifa e ao modelo', () => {
    expect(
      precoSemanalTvde({
        ...tvde,
        precoSemanaAcordado: 225,
        precoTarifa: 275,
        precoTarifaModelo: 260,
      })
    ).toEqual({ valor: 225, origem: 'acordado' });
  });

  it('0 acordado é um preço', () => {
    expect(precoSemanalTvde({ ...tvde, precoSemanaAcordado: 0, precoTarifa: 275 })).toEqual({
      valor: 0,
      origem: 'acordado',
    });
  });

  it('sem acordado, segue o preço geral da tarifa', () => {
    expect(
      precoSemanalTvde({
        ...tvde,
        precoSemanaAcordado: null,
        precoTarifa: 275,
        precoTarifaModelo: 260,
      })
    ).toEqual({ valor: 275, origem: 'tarifa' });
  });

  it('sem preço geral (null ou 0), cai para o do modelo', () => {
    expect(precoSemanalTvde({ ...tvde, precoTarifa: null, precoTarifaModelo: 260 }).valor).toBe(
      260
    );
    expect(precoSemanalTvde({ ...tvde, precoTarifa: 0, precoTarifaModelo: 260 }).valor).toBe(260);
    expect(precoSemanalTvde({ ...tvde, precoTarifa: '', precoTarifaModelo: '260' }).valor).toBe(
      260
    );
  });

  it('tarifa a 0 sem modelo cobra 0, como o fecho', () => {
    expect(precoSemanalTvde({ ...tvde, precoTarifa: 0 })).toEqual({ valor: 0, origem: 'tarifa' });
  });

  it('sem nada, não há preço', () => {
    expect(precoSemanalTvde({ ...tvde })).toEqual({ valor: null, origem: 'sem-preco' });
  });

  it.each(['rent_a_car', 'slot', null, undefined])('regime %s não é TVDE', (regime) => {
    expect(precoSemanalTvde({ regime, precoSemanaAcordado: 225, precoTarifa: 275 })).toEqual({
      valor: null,
      origem: 'sem-preco',
    });
  });
});

describe('precoSemanalTvde — texto, espaços e sem preço', () => {
  it('aceita acordado "225.00" e tarifa "0.00" (cai para o modelo)', () => {
    expect(precoSemanalTvde({ regime: 'tvde', precoSemanaAcordado: '225.00' })).toEqual({
      valor: 225,
      origem: 'acordado',
    });
    expect(
      precoSemanalTvde({ regime: 'tvde', precoTarifa: '0.00', precoTarifaModelo: '260.00' })
    ).toEqual({ valor: 260, origem: 'tarifa' });
  });

  it('regime " TVDE " é TVDE', () => {
    expect(precoSemanalTvde({ regime: ' TVDE ', precoTarifa: 275 }).valor).toBe(275);
  });

  it('sem tarifa nem modelo: sem-preco (null, não 0)', () => {
    expect(
      precoSemanalTvde({ regime: 'tvde', precoTarifa: null, precoTarifaModelo: null })
    ).toEqual({ valor: null, origem: 'sem-preco' });
  });
});
