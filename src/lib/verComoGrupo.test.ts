import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  resposta: { data: null as unknown, error: null as unknown },
  consultas: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const cadeia = {
    select: () => cadeia,
    eq: () => cadeia,
    maybeSingle: () => Promise.resolve(m.resposta),
  };
  return {
    supabase: {
      from: (tabela: string) => {
        m.consultas.push(tabela);
        return cadeia;
      },
    },
  };
});

import {
  VER_COMO_DISPONIVEL,
  carregarGrupoPrevisto,
  cargoPrevisivel,
  guardarVerComoGrupo,
  lerVerComoGrupo,
} from './verComoGrupo';

beforeEach(() => {
  localStorage.clear();
  m.consultas.length = 0;
  m.resposta = { data: null, error: null };
});

describe('escolha guardada', () => {
  it('só existe em dev (a build de produção não a tem)', () => {
    expect(VER_COMO_DISPONIVEL).toBe(import.meta.env.DEV);
  });

  it('fica guardada por org — noutra org não se aplica', () => {
    guardarVerComoGrupo('org-a', 'cargo-tvde');
    expect(lerVerComoGrupo('org-a')).toBe('cargo-tvde');
    expect(lerVerComoGrupo('org-b')).toBeNull();
  });

  it('"Eu (admin)" apaga a escolha', () => {
    guardarVerComoGrupo('org-a', 'cargo-tvde');
    guardarVerComoGrupo('org-a', null);
    expect(lerVerComoGrupo('org-a')).toBeNull();
  });

  it('lixo no armazenamento é ignorado', () => {
    localStorage.setItem('wegest:ver-como-grupo', '{nao é json');
    expect(lerVerComoGrupo('org-a')).toBeNull();
  });
});

describe('cargoPrevisivel', () => {
  it('grupos de admin ficam de fora — a BD já faz de quem os tem admin', () => {
    expect(cargoPrevisivel('Administrador')).toBe(false);
    expect(cargoPrevisivel('Suporte de TI (Admin)')).toBe(false);
  });

  it('os restantes grupos podem ser pré-visualizados', () => {
    expect(cargoPrevisivel('Gestor TVDE')).toBe(true);
    expect(cargoPrevisivel('Faturação')).toBe(true);
    expect(cargoPrevisivel('')).toBe(false);
  });
});

describe('carregarGrupoPrevisto', () => {
  it('sem escolha, nem pergunta à BD', async () => {
    expect(await carregarGrupoPrevisto('org-a')).toBeNull();
    expect(m.consultas).toEqual([]);
  });

  it('devolve o grupo escolhido', async () => {
    guardarVerComoGrupo('org-a', 'cargo-tvde');
    m.resposta = { data: { id: 'cargo-tvde', nome: 'Gestor TVDE' }, error: null };
    expect(await carregarGrupoPrevisto('org-a')).toEqual({ id: 'cargo-tvde', nome: 'Gestor TVDE' });
    expect(m.consultas).toEqual(['cargos']);
  });

  it('grupo apagado entretanto: volta à vista normal e esquece a escolha', async () => {
    guardarVerComoGrupo('org-a', 'cargo-apagado');
    expect(await carregarGrupoPrevisto('org-a')).toBeNull();
    expect(lerVerComoGrupo('org-a')).toBeNull();
  });

  it('grupo de admin não se pré-visualiza', async () => {
    guardarVerComoGrupo('org-a', 'cargo-admin');
    m.resposta = { data: { id: 'cargo-admin', nome: 'Administrador' }, error: null };
    expect(await carregarGrupoPrevisto('org-a')).toBeNull();
    expect(lerVerComoGrupo('org-a')).toBeNull();
  });

  it('erro de rede não apaga a escolha — tenta outra vez no próximo carregamento', async () => {
    guardarVerComoGrupo('org-a', 'cargo-tvde');
    m.resposta = { data: null, error: { message: 'Failed to fetch' } };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await carregarGrupoPrevisto('org-a')).toBeNull();
    expect(lerVerComoGrupo('org-a')).toBe('cargo-tvde');
  });
});
