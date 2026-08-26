import { describe, it, expect } from 'vitest';

import {
  nivelEnergia,
  normalizarPercentagem,
  precisaCombustivel,
  precisaEletrico,
  precisaGpl,
} from './combustivel';

describe('precisaCombustivel', () => {
  it('true para combustão e desconhecido', () => {
    for (const t of [
      'gasolina',
      'diesel',
      'hibrido',
      'gasolina_gpl',
      'diesel_gpl',
      '',
      null,
      undefined,
    ]) {
      expect(precisaCombustivel(t)).toBe(true);
    }
  });
  it('false para elétrico puro e GPL puro', () => {
    expect(precisaCombustivel('eletrico')).toBe(false);
    expect(precisaCombustivel('gpl')).toBe(false);
  });
});

describe('precisaEletrico', () => {
  it('true para elétrico e híbrido', () => {
    expect(precisaEletrico('eletrico')).toBe(true);
    expect(precisaEletrico('hibrido')).toBe(true);
  });
  it('false para os restantes', () => {
    expect(precisaEletrico('gasolina')).toBe(false);
    expect(precisaEletrico(null)).toBe(false);
  });
});

describe('precisaGpl', () => {
  it('true para gpl e bi-fuel', () => {
    expect(precisaGpl('gpl')).toBe(true);
    expect(precisaGpl('gasolina_gpl')).toBe(true);
    expect(precisaGpl('diesel_gpl')).toBe(true);
  });
  it('false para os restantes', () => {
    expect(precisaGpl('eletrico')).toBe(false);
    expect(precisaGpl('')).toBe(false);
  });
});

// O catálogo viatura_combustiveis guarda nomes de exibição (ex.: "Elétrico",
// "Híbrido"). O matching tem de ignorar acentos e maiúsculas.
describe('insensível a acentos e maiúsculas (nomes do catálogo)', () => {
  it('Elétrico → bateria, não combustível', () => {
    expect(precisaEletrico('Elétrico')).toBe(true);
    expect(precisaCombustivel('Elétrico')).toBe(false);
  });
  it('Híbrido → combustível e bateria', () => {
    expect(precisaEletrico('Híbrido')).toBe(true);
    expect(precisaCombustivel('Híbrido')).toBe(true);
  });
  it('Gasolina / Diesel → combustível', () => {
    expect(precisaCombustivel('Gasolina')).toBe(true);
    expect(precisaCombustivel('Diesel')).toBe(true);
  });
});

// Valores REAIS do catálogo viatura_combustiveis (nomes descritivos) — exigem
// matching por substring, não por igualdade exata.
describe('valores reais do catálogo', () => {
  it('Elétrico → só bateria', () => {
    expect(precisaEletrico('Elétrico')).toBe(true);
    expect(precisaCombustivel('Elétrico')).toBe(false);
    expect(precisaGpl('Elétrico')).toBe(false);
  });
  it('Híbrido Plug-in → combustível + bateria', () => {
    expect(precisaCombustivel('Híbrido Plug-in')).toBe(true);
    expect(precisaEletrico('Híbrido Plug-in')).toBe(true);
  });
  it('Híbrido/Diesel e Híbrido/Gasolina → combustível + bateria', () => {
    expect(precisaCombustivel('Híbrido/Diesel')).toBe(true);
    expect(precisaEletrico('Híbrido/Diesel')).toBe(true);
    expect(precisaCombustivel('Híbrido/Gasolina')).toBe(true);
    expect(precisaEletrico('Híbrido/Gasolina')).toBe(true);
  });
  it('Bi-Fuel - Gasolina/GPL → combustível + GPL', () => {
    expect(precisaCombustivel('Bi-Fuel - Gasolina/GPL')).toBe(true);
    expect(precisaGpl('Bi-Fuel - Gasolina/GPL')).toBe(true);
  });
});

// Sentinela das folhas de danos: numa viatura elétrica o campo de combustível
// saía em branco, porque a folha lê `combustivel_saida` e a bateria estava
// guardada noutra coluna. Isto é o que passa a preencher esse campo.
describe('nivelEnergia', () => {
  it('elétrica pura mostra a bateria, não o combustível', () => {
    expect(nivelEnergia('Elétrico', { combustivel: null, eletricidade: '80%' })).toBe('80%');
  });

  it('combustão mostra o combustível', () => {
    expect(nivelEnergia('Diesel', { combustivel: '3/4', eletricidade: null })).toBe('3/4');
  });

  it('híbrida mostra os dois — tem mesmo os dois depósitos', () => {
    expect(nivelEnergia('Híbrido/Gasolina', { combustivel: '1/2', eletricidade: '60%' })).toBe(
      '1/2 · 60%'
    );
  });

  it('híbrida com só um lado preenchido mostra esse lado, sem separador solto', () => {
    expect(nivelEnergia('Híbrido', { combustivel: '1/2', eletricidade: null })).toBe('1/2');
    expect(nivelEnergia('Híbrido', { combustivel: null, eletricidade: '60%' })).toBe('60%');
  });

  it('tipo desconhecido cai no combustível — é o que precisaCombustivel já assume', () => {
    expect(nivelEnergia(null, { combustivel: '1/4', eletricidade: null })).toBe('1/4');
  });

  it('sem valor nenhum devolve string vazia, para a folha não imprimir lixo', () => {
    expect(nivelEnergia('Elétrico', { combustivel: null, eletricidade: null })).toBe('');
    expect(nivelEnergia('Diesel', { combustivel: '', eletricidade: '' })).toBe('');
  });

  it('elétrica com combustível preenchido por engano ignora-o', () => {
    // Dados antigos, de quando a UI mostrava combustível a toda a gente.
    expect(nivelEnergia('Elétrico', { combustivel: 'Cheio', eletricidade: '90%' })).toBe('90%');
  });
});

// A bateria passou de cinco botões fixos (0/25/50/75/100) para número livre:
// um carro entregue a 73% não é 75%, e a diferença discute-se na devolução.
describe('normalizarPercentagem', () => {
  it('aceita número solto e acrescenta o %', () => {
    expect(normalizarPercentagem('73')).toBe('73%');
  });

  it('aceita já com % e não duplica', () => {
    expect(normalizarPercentagem('73%')).toBe('73%');
  });

  it('trava nos limites — não há bateria a 150% nem negativa', () => {
    expect(normalizarPercentagem('150')).toBe('100%');
    expect(normalizarPercentagem('-5')).toBe('0%');
  });

  it('arredonda decimais: o painel do carro não mostra casas', () => {
    expect(normalizarPercentagem('73,6')).toBe('74%');
    expect(normalizarPercentagem('73.4')).toBe('73%');
  });

  it('vazio ou lixo devolve vazio, para não gravar disparates na folha', () => {
    expect(normalizarPercentagem('')).toBe('');
    expect(normalizarPercentagem('   ')).toBe('');
    expect(normalizarPercentagem('abc')).toBe('');
  });
});
