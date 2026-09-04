import { describe, it, expect } from 'vitest';
import { classificarMovimento, agregarMovimentos } from '@shared/movimentosMotorista';

const mov = (tipo: string, categoria: string, valor: number) => ({ tipo, categoria, valor });

describe('classificarMovimento', () => {
  // O caso que originou isto: Carla Cabreiras, semana 17-23/08. A BV-24-QO
  // esteve na oficina dia e meio, foi lançado um crédito de 58,93 € com
  // categoria renda_viatura, e o resumo descartou-o em silêncio.
  it('um crédito de renda_viatura é um acerto e TEM de entrar', () => {
    expect(classificarMovimento(mov('credito', 'renda_viatura', 58.93))).toEqual({
      destino: 'receita_outras',
    });
  });

  it('um débito de renda_viatura fica de fora — o aluguer já vem dos dias × tarifa', () => {
    const c = classificarMovimento(mov('debito', 'renda_viatura', 275));
    expect(c.destino).toBe('ignorado');
    expect(c.motivo).toContain('renda_viatura');
  });

  it('o mesmo para aluguer e reparacao, que também são calculados à parte', () => {
    expect(classificarMovimento(mov('debito', 'aluguer', 100)).destino).toBe('ignorado');
    expect(classificarMovimento(mov('debito', 'reparacao', 100)).destino).toBe('ignorado');
  });

  it('mas os créditos dessas mesmas categorias entram', () => {
    expect(classificarMovimento(mov('credito', 'aluguer', 40)).destino).toBe('receita_outras');
    expect(classificarMovimento(mov('credito', 'reparacao', 40)).destino).toBe('receita_outras');
  });

  it('créditos de bolt e uber ficam de fora — já vêm na receita da plataforma', () => {
    expect(classificarMovimento(mov('credito', 'bolt', 200)).destino).toBe('ignorado');
    expect(classificarMovimento(mov('credito', 'uber', 200)).destino).toBe('ignorado');
  });

  it('caução: débito conta, devolução é tratada à parte', () => {
    expect(classificarMovimento(mov('debito', 'caucao', 500)).destino).toBe('caucao');
    expect(classificarMovimento(mov('credito', 'caucao', 500)).destino).toBe('ignorado');
  });

  it('seguros têm balde próprio', () => {
    expect(classificarMovimento(mov('debito', 'seguros', 30)).destino).toBe('seguros');
  });

  // A propriedade que impede o erro de voltar: uma categoria que ninguém
  // previu não pode fazer dinheiro desaparecer.
  it('uma categoria desconhecida vai para outros, nunca para o lixo', () => {
    expect(classificarMovimento(mov('debito', 'categoria_que_ainda_nao_existe', 12)).destino).toBe(
      'outros'
    );
    expect(classificarMovimento(mov('debito', '', 12)).destino).toBe('outros');
    expect(classificarMovimento({ tipo: null, categoria: null, valor: 12 }).destino).toBe('outros');
  });

  it('não se importa com maiúsculas nem espaços', () => {
    expect(classificarMovimento(mov(' Credito ', ' Renda_Viatura ', 10)).destino).toBe(
      'receita_outras'
    );
  });
});

describe('agregarMovimentos', () => {
  it('soma cada balde e devolve o que ficou de fora, com motivo', () => {
    const r = agregarMovimentos([
      mov('credito', 'renda_viatura', 58.93), // acerto da oficina
      mov('debito', 'renda_viatura', 275), // o aluguer, já calculado
      mov('debito', 'caucao', 500),
      mov('debito', 'seguros', 30),
      mov('debito', 'multa', 60), // desconhecida -> outros
      mov('credito', 'bolt', 200), // já na receita
    ]);

    expect(r.receitaOutras).toBeCloseTo(58.93, 2);
    expect(r.caucao).toBe(500);
    expect(r.seguros).toBe(30);
    expect(r.outros).toBe(60);
    expect(r.ignorados).toHaveLength(2);
    expect(r.ignorados.map((i) => i.categoria).sort()).toEqual(['bolt', 'renda_viatura']);
    expect(r.ignorados.every((i) => i.motivo.length > 0)).toBe(true);
  });

  it('nada entra e nada rebenta com lista vazia ou nula', () => {
    for (const entrada of [[], null, undefined]) {
      const r = agregarMovimentos(entrada);
      expect(r.receitaOutras + r.caucao + r.seguros + r.outros).toBe(0);
      expect(r.ignorados).toEqual([]);
    }
  });

  it('nenhum movimento se perde: o que entra ou é somado ou é listado', () => {
    const movs = [
      mov('credito', 'renda_viatura', 10),
      mov('debito', 'aluguer', 20),
      mov('debito', 'seja_o_que_for', 30),
      mov('credito', 'uber', 40),
    ];
    const r = agregarMovimentos(movs);
    const somados = r.receitaOutras + r.caucao + r.seguros + r.outros;
    const ignorados = r.ignorados.reduce((s, i) => s + i.valor, 0);
    expect(somados + ignorados).toBe(100);
  });
});
