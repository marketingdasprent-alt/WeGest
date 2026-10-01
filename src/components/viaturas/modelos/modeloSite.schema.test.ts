import { describe, expect, it } from 'vitest';
import {
  caminhoFotoModelo,
  modeloSiteDeLinha,
  modeloSiteSchema,
  modeloSiteVazio,
  validarFotoModelo,
} from './modeloSite.schema';

describe('modeloSiteSchema', () => {
  it('aceita o vazio (modelo ainda sem dados do site)', () => {
    expect(modeloSiteSchema.safeParse(modeloSiteVazio).success).toBe(true);
  });
  it('lugares fora de 1..9 é recusado com mensagem PT', () => {
    const r = modeloSiteSchema.safeParse({ ...modeloSiteVazio, lugares: 12 });
    expect(r.success).toBe(false);
    expect(r.success ? '' : r.error.issues[0].message).toBe('Lugares entre 1 e 9');
  });
  it('caixa só manual ou automatica', () => {
    expect(modeloSiteSchema.safeParse({ ...modeloSiteVazio, caixa: 'cvt' }).success).toBe(false);
  });
  it('portas e bagageira têm limites próprios', () => {
    expect(modeloSiteSchema.safeParse({ ...modeloSiteVazio, portas: 1 }).success).toBe(false);
    expect(modeloSiteSchema.safeParse({ ...modeloSiteVazio, bagageira: 11 }).success).toBe(false);
    expect(
      modeloSiteSchema.safeParse({ ...modeloSiteVazio, portas: 5, bagageira: 0 }).success
    ).toBe(true);
  });
  it('imagem_url tem de ser URL', () => {
    expect(modeloSiteSchema.safeParse({ ...modeloSiteVazio, imagem_url: 'foto.png' }).success).toBe(
      false
    );
  });
  it('lê a linha da base com nulos', () => {
    expect(
      modeloSiteDeLinha({
        caixa: null,
        lugares: 5,
        portas: null,
        bagageira: null,
        ar_condicionado: true,
        imagem_url: null,
      })
    ).toEqual({
      caixa: null,
      lugares: 5,
      portas: null,
      bagageira: null,
      ar_condicionado: true,
      imagem_url: null,
    });
  });
  it('linha com caixa desconhecida na base cai para null em vez de partir o form', () => {
    expect(modeloSiteDeLinha({ caixa: 'cvt' }).caixa).toBeNull();
    expect(modeloSiteDeLinha(null)).toEqual(modeloSiteVazio);
  });
});

describe('foto do modelo', () => {
  const ficheiro = (type: string, size: number) => ({ type, size }) as File;
  it('só jpeg, png ou webp até 2 MB (os limites do bucket)', () => {
    expect(validarFotoModelo(ficheiro('image/png', 1000))).toBeNull();
    expect(validarFotoModelo(ficheiro('image/gif', 1000))).toBe('Use JPEG, PNG ou WebP.');
    expect(validarFotoModelo(ficheiro('image/jpeg', 3 * 1024 * 1024))).toBe(
      'A foto tem de ter até 2 MB.'
    );
  });
  it('caminho é <org>/<modelo>.<ext> pelo tipo, não pelo nome do ficheiro', () => {
    expect(caminhoFotoModelo('o1', 'm1', ficheiro('image/webp', 1))).toBe('o1/m1.webp');
    expect(caminhoFotoModelo('o1', 'm1', ficheiro('image/jpeg', 1))).toBe('o1/m1.jpg');
  });
});
