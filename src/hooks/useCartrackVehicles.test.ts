import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  INTERVALO_LIVE_MS,
  INTERVALO_LIVE_SEGUNDOS,
  plateKey,
  hasValidPosition,
} from './useCartrackVehicles';

// O modo "Ao vivo" faz um poll à API da Cartrack por cada cliente com o mapa
// aberto, sem cache partilhada: o intervalo multiplica-se por utilizador. A 10s
// eram 360 chamadas/hora por pessoa; o valor foi subido para 30s (2026-07-29).
// O intervalo estava duplicado à mão em 4 sítios — o default do hook, as duas
// chamadas, e ainda escrito no texto que o utilizador lê ("ao vivo (10s)").
// Estes testes fixam a fonte única e, sobretudo, que nenhum desses sítios
// volta a ter o número escrito à mão.
describe('useCartrackVehicles — intervalo do modo "Ao vivo"', () => {
  it('mantém o intervalo em 30s (não voltar aos 10s sem decidir a quota)', () => {
    expect(INTERVALO_LIVE_MS).toBe(30_000);
  });

  it('expõe o valor em segundos derivado do de milissegundos, não duplicado', () => {
    expect(INTERVALO_LIVE_SEGUNDOS).toBe(INTERVALO_LIVE_MS / 1000);
  });

  it('não desce abaixo de 30s — protege a quota da API Cartrack', () => {
    // 30s ⇒ no máximo 120 chamadas/hora por cliente. Descer daqui multiplica o
    // consumo de uma API externa sem limite contratual conhecido.
    expect(INTERVALO_LIVE_MS).toBeGreaterThanOrEqual(30_000);
    expect(3_600_000 / INTERVALO_LIVE_MS).toBeLessThanOrEqual(120);
  });
});

describe('useCartrackVehicles — sem intervalos escritos à mão nos consumidores', () => {
  const ficheiros = [
    'src/components/dashboard/CartrackMapCard.tsx',
    'src/components/viaturas/tabs/ViaturaTabGeolocalizacao.tsx',
  ];

  it.each(ficheiros)('%s não passa intervalMs literal ao useCartrackLive', (caminho) => {
    const src = readFileSync(resolve(process.cwd(), caminho), 'utf8');
    // Qualquer `intervalMs: <número>` reintroduz a duplicação que este trabalho
    // eliminou: o hook passaria a ter um valor e o consumidor outro.
    expect(src).not.toMatch(/intervalMs:\s*\d/);
  });

  it.each(ficheiros)('%s não tem o intervalo escrito à mão no texto da UI', (caminho) => {
    const src = readFileSync(resolve(process.cwd(), caminho), 'utf8');
    // Era aqui que a UI mentia: o número no rótulo era uma 4.ª cópia e ficou
    // nos 10s. Os rótulos têm de derivar de INTERVALO_LIVE_SEGUNDOS.
    expect(src).not.toMatch(/\(\d+s\)/);
    expect(src).toContain('INTERVALO_LIVE_SEGUNDOS');
  });
});

describe('plateKey — normalização de matrícula usada para cruzar live ↔ BD', () => {
  it('normaliza formatos diferentes da mesma matrícula à mesma chave', () => {
    expect(plateKey('12-AB-34')).toBe('12AB34');
    expect(plateKey('12 ab 34')).toBe('12AB34');
    expect(plateKey('12ab34')).toBe('12AB34');
  });

  it('trata null/undefined/vazio sem rebentar', () => {
    expect(plateKey(null)).toBe('');
    expect(plateKey(undefined)).toBe('');
    expect(plateKey('')).toBe('');
  });
});

describe('hasValidPosition — só desenha no mapa quem tem coordenadas reais', () => {
  const base = { last_latitude: 38.7, last_longitude: -9.1 };

  it('aceita coordenadas numéricas válidas', () => {
    expect(hasValidPosition(base as never)).toBe(true);
  });

  it('rejeita null, undefined e NaN', () => {
    expect(hasValidPosition({ last_latitude: null, last_longitude: -9.1 } as never)).toBe(false);
    expect(hasValidPosition({ last_latitude: 38.7, last_longitude: null } as never)).toBe(false);
    expect(hasValidPosition({ last_latitude: NaN, last_longitude: -9.1 } as never)).toBe(false);
    expect(hasValidPosition({} as never)).toBe(false);
  });
});
