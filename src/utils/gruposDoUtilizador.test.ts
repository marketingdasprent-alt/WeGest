import { describe, expect, it } from 'vitest';
import {
  algumGrupoAdmin,
  diferencaGrupos,
  ehGrupoAdmin,
  idsDosGrupos,
  nomesDosGrupos,
  somarPermissoes,
} from './gruposDoUtilizador';

describe('idsDosGrupos', () => {
  it('põe o principal primeiro e não repete', () => {
    expect(idsDosGrupos('a', ['b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('sem principal, ficam os adicionais', () => {
    expect(idsDosGrupos(null, ['b'])).toEqual(['b']);
  });

  it('quem só tem um grupo fica com esse', () => {
    expect(idsDosGrupos('a', [])).toEqual(['a']);
  });
});

describe('somarPermissoes', () => {
  it('soma o acesso de todos os grupos', () => {
    const r = somarPermissoes([
      { recurso_id: 'r1', tem_acesso: true, pode_editar: false },
      { recurso_id: 'r2', tem_acesso: true, pode_editar: true },
    ]);
    expect(r.acesso.sort()).toEqual(['r1', 'r2']);
  });

  it('edita se algum grupo que dá o acesso deixa editar', () => {
    const r = somarPermissoes([
      { recurso_id: 'r1', tem_acesso: true, pode_editar: false },
      { recurso_id: 'r1', tem_acesso: true, pode_editar: true },
    ]);
    expect(r.acesso).toEqual(['r1']);
    expect(r.edicao).toEqual(['r1']);
  });

  it('um grupo sem acesso não dá acesso nem edição', () => {
    const r = somarPermissoes([{ recurso_id: 'r1', tem_acesso: false, pode_editar: true }]);
    expect(r.acesso).toEqual([]);
    expect(r.edicao).toEqual([]);
  });

  it('sem linhas não há permissões', () => {
    expect(somarPermissoes([])).toEqual({ acesso: [], edicao: [] });
  });
});

describe('administrador', () => {
  it('reconhece "admin" no nome, sem ligar a maiúsculas', () => {
    expect(ehGrupoAdmin('Administrador')).toBe(true);
    expect(ehGrupoAdmin('Suporte de TI (Admin)')).toBe(true);
    expect(ehGrupoAdmin('Gestor TVDE')).toBe(false);
    expect(ehGrupoAdmin(null)).toBe(false);
  });

  it('qualquer grupo de administrador chega', () => {
    expect(algumGrupoAdmin(['Gestor TVDE', 'Administrador'])).toBe(true);
    expect(algumGrupoAdmin(['Gestor TVDE', 'Faturação'])).toBe(false);
    expect(algumGrupoAdmin([])).toBe(false);
  });
});

describe('diferencaGrupos', () => {
  it('diz o que juntar e o que tirar', () => {
    expect(diferencaGrupos(['a', 'b'], ['b', 'c'])).toEqual({ inserir: ['c'], remover: ['a'] });
  });

  it('sem mudanças, não faz nada', () => {
    expect(diferencaGrupos(['a'], ['a'])).toEqual({ inserir: [], remover: [] });
  });
});

describe('nomesDosGrupos', () => {
  it('traduz os ids para nomes, na mesma ordem, e ignora ids desconhecidos', () => {
    const grupos = [
      { id: 'a', nome: 'Faturação' },
      { id: 'b', nome: 'Gestor TVDE' },
    ];
    expect(nomesDosGrupos(['b', 'x', 'a'], grupos)).toEqual(['Gestor TVDE', 'Faturação']);
  });
});
