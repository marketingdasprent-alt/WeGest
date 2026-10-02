import { describe, expect, it } from 'vitest';
import { indiceVizinho } from './galeriaIndice';

describe('indiceVizinho', () => {
  it('avança e recua dentro da galeria', () => {
    expect(indiceVizinho(1, 5, 1)).toBe(2);
    expect(indiceVizinho(1, 5, -1)).toBe(0);
  });

  it('dá a volta nas pontas', () => {
    expect(indiceVizinho(4, 5, 1)).toBe(0);
    expect(indiceVizinho(0, 5, -1)).toBe(4);
  });

  it('com uma foto só, fica nela', () => {
    expect(indiceVizinho(0, 1, 1)).toBe(0);
    expect(indiceVizinho(0, 1, -1)).toBe(0);
  });

  it('galeria vazia devolve 0', () => {
    expect(indiceVizinho(0, 0, 1)).toBe(0);
  });
});
