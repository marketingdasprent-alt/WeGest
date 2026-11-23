import { describe, it, expect } from 'vitest';
import { filtrarPedidos, FILTROS_PEDIDOS_INICIAIS, type PedidoFiltravel } from './filtrarPedidos';

const pedido = (p: Partial<PedidoFiltravel> & { id: string }): PedidoFiltravel => ({
  contrato_codigo: 1,
  tipo: 'kms',
  estado: 'aceite',
  motivo: '',
  created_at: '2026-01-01T10:00:00Z',
  respondido_em: null,
  ...p,
});

const base = [
  pedido({
    id: 'a',
    contrato_codigo: 10,
    tipo: 'kms',
    estado: 'aceite',
    motivo: 'Cliente pediu mais quilómetros',
    created_at: '2026-01-01T10:00:00Z',
    respondido_em: '2026-01-05T10:00:00Z',
  }),
  pedido({
    id: 'b',
    contrato_codigo: 30,
    tipo: 'preco_semana',
    estado: 'recusado',
    motivo: 'Desconto',
    created_at: '2026-01-02T10:00:00Z',
    respondido_em: '2026-01-03T10:00:00Z',
  }),
  pedido({
    id: 'c',
    contrato_codigo: 20,
    tipo: 'tarifa',
    estado: 'aceite',
    motivo: 'Fidelização',
    created_at: '2026-01-03T10:00:00Z',
    respondido_em: '2026-01-04T10:00:00Z',
  }),
  pedido({
    id: 'd',
    contrato_codigo: null,
    tipo: 'franquia',
    estado: 'recusado',
    motivo: 'Sem código',
    created_at: '2026-01-06T10:00:00Z',
    respondido_em: null,
  }),
];

const ids = (l: PedidoFiltravel[]) => l.map((p) => p.id);

describe('filtrarPedidos', () => {
  it('ordena por contrato descendente por omissão, sem código no fim', () => {
    expect(ids(filtrarPedidos(base, FILTROS_PEDIDOS_INICIAIS))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('ordena por contrato ascendente, sem código no fim', () => {
    const r = filtrarPedidos(base, { ...FILTROS_PEDIDOS_INICIAIS, ordenacao: 'contrato_asc' });
    expect(ids(r)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('ordena por data de resposta, caindo para a data do pedido', () => {
    const desc = filtrarPedidos(base, { ...FILTROS_PEDIDOS_INICIAIS, ordenacao: 'data_desc' });
    expect(ids(desc)).toEqual(['d', 'a', 'c', 'b']);
    const asc = filtrarPedidos(base, { ...FILTROS_PEDIDOS_INICIAIS, ordenacao: 'data_asc' });
    expect(ids(asc)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('filtra por tipo e por estado', () => {
    expect(ids(filtrarPedidos(base, { ...FILTROS_PEDIDOS_INICIAIS, tipo: 'tarifa' }))).toEqual([
      'c',
    ]);
    const recusados = filtrarPedidos(base, { ...FILTROS_PEDIDOS_INICIAIS, estado: 'recusado' });
    expect(ids(recusados)).toEqual(['b', 'd']);
  });

  it('combina tipo e estado', () => {
    const r = filtrarPedidos(base, {
      ...FILTROS_PEDIDOS_INICIAIS,
      tipo: 'kms',
      estado: 'recusado',
    });
    expect(r).toEqual([]);
  });

  it('pesquisa por número de contrato, com ou sem cardinal', () => {
    expect(ids(filtrarPedidos(base, { ...FILTROS_PEDIDOS_INICIAIS, pesquisa: '20' }))).toEqual([
      'c',
    ]);
    expect(ids(filtrarPedidos(base, { ...FILTROS_PEDIDOS_INICIAIS, pesquisa: '#30' }))).toEqual([
      'b',
    ]);
  });

  it('pesquisa no motivo sem distinguir maiúsculas nem acentos', () => {
    expect(
      ids(filtrarPedidos(base, { ...FILTROS_PEDIDOS_INICIAIS, pesquisa: 'QUILOMETROS' }))
    ).toEqual(['a']);
    expect(
      ids(filtrarPedidos(base, { ...FILTROS_PEDIDOS_INICIAIS, pesquisa: 'fidelizacao' }))
    ).toEqual(['c']);
  });

  it('ignora espaços na pesquisa e devolve tudo se estiver vazia', () => {
    expect(filtrarPedidos(base, { ...FILTROS_PEDIDOS_INICIAIS, pesquisa: '   ' })).toHaveLength(4);
  });

  it('devolve lista vazia sem resultados e não muda a lista original', () => {
    const copia = [...base];
    expect(filtrarPedidos(base, { ...FILTROS_PEDIDOS_INICIAIS, pesquisa: 'zzz' })).toEqual([]);
    expect(base).toEqual(copia);
    expect(filtrarPedidos([], FILTROS_PEDIDOS_INICIAIS)).toEqual([]);
  });

  it('aguenta motivo ausente', () => {
    const sem = [pedido({ id: 'x', motivo: undefined as unknown as string })];
    expect(filtrarPedidos(sem, { ...FILTROS_PEDIDOS_INICIAIS, pesquisa: 'a' })).toEqual([]);
  });

  it('datas inválidas ficam no fim nos dois sentidos', () => {
    const lista = [
      pedido({ id: 'x', created_at: 'lixo', respondido_em: null }),
      pedido({ id: 'y', created_at: '2026-01-01T10:00:00Z' }),
      pedido({ id: 'z', created_at: '2026-02-01T10:00:00Z' }),
    ];
    expect(
      ids(filtrarPedidos(lista, { ...FILTROS_PEDIDOS_INICIAIS, ordenacao: 'data_desc' }))
    ).toEqual(['z', 'y', 'x']);
    expect(
      ids(filtrarPedidos(lista, { ...FILTROS_PEDIDOS_INICIAIS, ordenacao: 'data_asc' }))
    ).toEqual(['y', 'z', 'x']);
  });
});
