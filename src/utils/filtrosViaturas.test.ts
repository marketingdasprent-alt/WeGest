import { describe, it, expect } from 'vitest';

import {
  SEM_INFO,
  filtrarViaturas,
  grupoCombustivel,
  opcoesFiltrosViaturas,
  passaEstado,
  type FiltrosViaturas,
} from './filtrosViaturas';

interface V {
  matricula: string;
  marca?: string | null;
  modelo?: string | null;
  categoria?: string | null;
  combustivel?: string | null;
  tipo_id?: string | null;
  is_slot?: boolean;
  is_vendida?: boolean;
  inspecao_validade?: string | null;
  seguro_validade?: string | null;
  ocupante_nome?: string | null;
  estado: string;
}

const estadoDe = (v: V) => v.estado;
const SEM_FILTROS: FiltrosViaturas = {
  search: '',
  status: 'all',
  categoria: 'all',
  combustivel: 'all',
  tipo: 'all',
};
const f = (mudar: Partial<FiltrosViaturas>) => ({ ...SEM_FILTROS, ...mudar });

describe('grupoCombustivel — as várias grafias que existem na BD', () => {
  it.each([
    ['Elétrico', 'eletrico'],
    ['eletrico', 'eletrico'],
    ['Diesel', 'diesel'],
    ['diesel', 'diesel'],
    ['Gasolina', 'gasolina'],
    ['hibrido', 'hibrido'],
    ['Híbrido/Gasolina', 'hibrido'],
    ['Híbrido Plug-in', 'hibrido'],
    ['Bi-Fuel - Gasolina/GPL', 'gpl'],
  ])('%s → %s', (valor, grupo) => {
    expect(grupoCombustivel(valor)).toBe(grupo);
  });

  it('vazio é "sem informação"', () => {
    expect(grupoCombustivel(null)).toBe(SEM_INFO);
    expect(grupoCombustivel('  ')).toBe(SEM_INFO);
  });
});

describe('filtrarViaturas', () => {
  const frota: V[] = [
    { matricula: 'AA-11-AA', marca: 'Tesla', combustivel: 'Elétrico', estado: 'disponivel' },
    { matricula: 'BB-22-BB', marca: 'Kia', combustivel: 'eletrico', estado: 'em_tvde' },
    {
      matricula: 'CC-33-CC',
      marca: 'Toyota',
      combustivel: 'Híbrido/Gasolina',
      estado: 'em_reserva',
    },
    { matricula: 'DD-44-DD', marca: 'Seat', combustivel: null, estado: 'manutencao' },
    {
      matricula: 'EE-55-EE',
      marca: 'Kia',
      combustivel: 'Diesel',
      estado: 'disponivel',
      is_vendida: true,
    },
  ];

  it('Elétrico apanha todas as grafias (antes só apanhava a exacta)', () => {
    const r = filtrarViaturas(frota, f({ combustivel: 'eletrico' }), estadoDe);
    expect(r.map((v) => v.matricula)).toEqual(['AA-11-AA', 'BB-22-BB']);
  });

  it('"Sem informação" encontra as fichas por preencher', () => {
    const r = filtrarViaturas(frota, f({ combustivel: SEM_INFO }), estadoDe);
    expect(r.map((v) => v.matricula)).toEqual(['DD-44-DD']);
  });

  it('pesquisa ignora hífens, acentos e maiúsculas', () => {
    expect(filtrarViaturas(frota, f({ search: 'bb22' }), estadoDe)).toHaveLength(1);
    expect(filtrarViaturas(frota, f({ search: 'KIA' }), estadoDe)).toHaveLength(1);
  });

  it('as vendidas ficam de fora, excepto nos filtros de vendidas', () => {
    expect(filtrarViaturas(frota, SEM_FILTROS, estadoDe)).toHaveLength(4);
    expect(filtrarViaturas(frota, f({ status: 'vendido' }), estadoDe)).toHaveLength(1);
    expect(filtrarViaturas(frota, f({ status: 'todos_vendidos' }), estadoDe)).toHaveLength(5);
  });

  it('"Alugadas" são as em uso sem as reservas', () => {
    expect(passaEstado(frota[1], 'alugadas', estadoDe)).toBe(true);
    expect(passaEstado(frota[2], 'alugadas', estadoDe)).toBe(false);
    expect(passaEstado(frota[2], 'em_uso', estadoDe)).toBe(true);
  });
});

describe('opcoesFiltrosViaturas — contagens ao vivo', () => {
  const frota: V[] = [
    { matricula: '1', combustivel: 'Elétrico', estado: 'disponivel' },
    { matricula: '2', combustivel: 'eletrico', estado: 'em_tvde' },
    { matricula: '3', combustivel: 'Diesel', estado: 'disponivel' },
    { matricula: '4', combustivel: null, categoria: 'green', estado: 'em_tvde' },
  ];

  it('cada combustível diz quantas viaturas dá, e só aparecem os que existem', () => {
    const { combustivel } = opcoesFiltrosViaturas(frota, SEM_FILTROS, estadoDe);
    expect(combustivel.map((o) => [o.label, o.count])).toEqual([
      ['Todos', 4],
      ['Elétrico', 2],
      ['Diesel', 1],
      ['Sem informação', 1],
    ]);
  });

  it('as contagens de um filtro respeitam os outros já escolhidos', () => {
    const { combustivel, status } = opcoesFiltrosViaturas(
      frota,
      f({ status: 'disponivel' }),
      estadoDe
    );
    expect(combustivel.find((o) => o.value === 'eletrico')?.count).toBe(1);
    // A faceta de estado não se filtra a si própria: mostra as alternativas.
    expect(status.find((o) => o.value === 'em_tvde')?.count).toBe(2);
  });

  it('estados sem viaturas não aparecem — excepto "Todos" e o escolhido', () => {
    const { status } = opcoesFiltrosViaturas(frota, f({ status: 'inativo' }), estadoDe);
    const valores = status.map((o) => o.value);
    expect(valores).toContain('all');
    expect(valores).toContain('inativo');
    expect(valores).not.toContain('manutencao');
  });
});

describe('filtros novos da Frota', () => {
  const frota: V[] = [
    { matricula: 'AA-11-AA', estado: 'disponivel', seguro_validade: '2000-01-01' },
    { matricula: 'BB-22-BB', estado: 'em_tvde', inspecao_validade: '2999-01-01' },
    { matricula: 'CC-33-CC', estado: 'inativo', seguro_validade: '2000-01-01' },
    { matricula: 'DD-44-DD', estado: 'em_tvde', ocupante_nome: 'João Silva' },
  ];

  it('"Precisa de atenção": documentos vencidos/a vencer, sem as inativas', () => {
    const r = filtrarViaturas(frota, f({ status: 'atencao' }), estadoDe);
    expect(r.map((v) => v.matricula)).toEqual(['AA-11-AA']);
  });

  it('pesquisa também pelo nome de quem tem a viatura', () => {
    const r = filtrarViaturas(frota, f({ search: 'joão' }), estadoDe);
    expect(r.map((v) => v.matricula)).toEqual(['DD-44-DD']);
  });
});
