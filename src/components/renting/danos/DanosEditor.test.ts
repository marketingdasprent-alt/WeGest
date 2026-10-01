import { describe, it, expect, vi } from 'vitest';
import {
  fotosGravaveis,
  novoDanoVazio,
  reidratarDanos,
  validarDanos,
  type DanoFicheiro,
  type NovoDano,
} from './DanosEditor';

const dano = (p: Partial<NovoDano> = {}): NovoDano => ({
  ...novoDanoVazio(),
  descricao: 'Risco no para-choques',
  ...p,
});

const foto = (p: Partial<DanoFicheiro> = {}): DanoFicheiro => ({
  id: 'f-1',
  nome: 'frente.jpg',
  tipo: 'image/jpeg',
  preview: null,
  path: 'rascunho/contrato-1/frente.jpg',
  estado: 'subido',
  ...p,
});

describe('validarDanos', () => {
  it('aceita lista vazia — registar danos é opcional', () => {
    expect(validarDanos([])).toBeNull();
  });

  it('exige descrição: um dano sem ela não diz nada a quem o ler depois', () => {
    expect(validarDanos([dano({ descricao: '   ' })])).toMatch(/descrição/i);
  });

  it('aceita dano sem valor — "por avaliar" é um estado legítimo', () => {
    expect(validarDanos([dano({ valor: '' })])).toBeNull();
  });

  it('aceita valor numérico', () => {
    expect(validarDanos([dano({ valor: '180.50' })])).toBeNull();
  });

  it('rejeita valor que não é número', () => {
    expect(validarDanos([dano({ valor: 'muito caro' })])).toMatch(/número/i);
  });

  it('localização é opcional', () => {
    expect(validarDanos([dano({ localizacao: '' })])).toBeNull();
  });

  it('aponta o problema mesmo quando só um dano da lista está mal', () => {
    expect(validarDanos([dano(), dano({ descricao: '' }), dano()])).toMatch(/descrição/i);
  });

  // As fotos sobem ao ser escolhidas; gravar a meio deixava danos sem fotos.
  it('bloqueia enquanto houver fotos a carregar', () => {
    expect(validarDanos([dano({ files: [foto({ estado: 'a_subir', path: null })] })])).toMatch(
      /a carregar/i
    );
  });

  it('bloqueia fotos que não conseguiram subir — em vez de as perder em silêncio', () => {
    expect(validarDanos([dano({ files: [foto({ estado: 'erro', path: null })] })])).toMatch(
      /não conseguiram/i
    );
  });

  it('aceita fotos já no bucket', () => {
    expect(validarDanos([dano({ files: [foto()] })])).toBeNull();
  });
});

describe('fotosGravaveis', () => {
  it('só devolve as que já estão no bucket, com caminho e nome', () => {
    const d = dano({
      files: [
        foto({ id: 'a', path: 'rascunho/x/a.jpg', nome: 'a.jpg' }),
        foto({ id: 'b', estado: 'a_subir', path: null }),
        foto({ id: 'c', estado: 'erro', path: null }),
      ],
    });
    expect(fotosGravaveis(d)).toEqual([{ path: 'rascunho/x/a.jpg', nome: 'a.jpg' }]);
  });
});

describe('reidratarDanos', () => {
  it('foto com caminho volta como subida; a miniatura vem do bucket depois', () => {
    const [d] = reidratarDanos([dano({ files: [foto({ preview: 'blob:velho' })] })]);
    expect(d.files[0]).toMatchObject({ estado: 'subido', path: foto().path, preview: null });
  });

  it('foto ainda em memória (rascunho antigo, só File) fica por subir, com nome e tipo do ficheiro', () => {
    URL.createObjectURL = vi.fn(() => 'blob:novo');
    const file = new File(['x'], 'porta.png', { type: 'image/png' });
    const antigo = { id: 'f', file, preview: 'blob:revogado' } as unknown as DanoFicheiro;
    const [d] = reidratarDanos([dano({ files: [antigo] })]);
    expect(d.files[0]).toMatchObject({
      estado: 'a_subir',
      nome: 'porta.png',
      tipo: 'image/png',
      preview: 'blob:novo',
    });
    expect(d.files[0].file).toBe(file);
  });

  it('sem caminho nem ficheiro não há nada a repor', () => {
    const [d] = reidratarDanos([dano({ files: [foto({ path: null, estado: 'erro' })] })]);
    expect(d.files).toEqual([]);
  });

  it('aguenta rascunhos vazios', () => {
    expect(reidratarDanos(undefined)).toEqual([]);
    expect(reidratarDanos([{ ...dano(), files: undefined as unknown as DanoFicheiro[] }])).toEqual([
      { ...dano(), id: expect.any(String), files: [] },
    ]);
  });
});

describe('novoDanoVazio', () => {
  it('nasce vazio e com id próprio', () => {
    const a = novoDanoVazio();
    const b = novoDanoVazio();
    expect(a.descricao).toBe('');
    expect(a.valor).toBe('');
    expect(a.files).toEqual([]);
    expect(a.id).not.toBe(b.id);
  });
});
