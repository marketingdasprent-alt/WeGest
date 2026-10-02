import { describe, expect, it } from 'vitest';
import { atributosDe, tipoDoParametro } from './atributos';
import { ERROS_FASE_A } from './erros';
import { realcar } from './realce';
import { esquemaComponente, operacao, operacoes } from './spec';

describe('atributos do esquema', () => {
  it('Modelo: tipos legíveis, nulos, enums e categoria aninhada', () => {
    const a = atributosDe(esquemaComponente('Modelo'));
    const por = Object.fromEntries(a.map((x) => [x.nome, x]));
    expect(por.id.tipo).toBe('uuid');
    expect(por.lugares.tipo).toBe('inteiro');
    expect(por.portas.nulavel).toBe(true);
    expect(por.caixa.valores).toEqual(['manual', 'automatica']);
    expect(por.categoria.tipo).toBe('objecto');
    expect(por.categoria.nulavel).toBe(true);
    expect(por.categoria.filhos.map((f) => f.nome)).toEqual(['id', 'nome']);
    expect(por.preco_dia.filhos.map((f) => f.nome)).toEqual(['sem_iva', 'com_iva', 'iva']);
    expect(por.preco_dia.filhos.every((f) => f.obrigatorio)).toBe(true);
  });

  it('ModeloDetalhe junta o allOf e mostra a lista de coberturas pelo nome do esquema', () => {
    const a = atributosDe(esquemaComponente('ModeloDetalhe'));
    const nomes = a.map((x) => x.nome);
    expect(nomes).toContain('marca');
    expect(nomes).toContain('tarifa');
    const cob = a.find((x) => x.nome === 'coberturas');
    expect(cob?.tipo).toBe('lista de Cobertura');
    expect(cob?.filhos.map((f) => f.nome)).toContain('franquia');
  });

  it('tipo dos parâmetros', () => {
    const [categoria, tipo] = operacao('GET /modelos').parametros;
    expect(tipoDoParametro(categoria.esquema)).toBe('uuid');
    expect(tipoDoParametro(tipo.esquema)).toBe('texto');
  });
});

describe('códigos de erro', () => {
  it('todo o código de erro do OpenAPI está na página Erros, com o estado certo', () => {
    const porCodigo = new Map(ERROS_FASE_A.map((e) => [e.codigo, e]));
    for (const op of operacoes()) {
      for (const r of op.respostas.filter((x) => x.codigo)) {
        const e = porCodigo.get(r.codigo as string);
        expect(e, `${op.id} ${r.codigo}`).toBeTruthy();
        expect(e?.estados, `${op.id} ${r.codigo}`).toContain(r.estado);
      }
    }
  });

  it('os códigos das reservas (fase C) estão activos, com 409', () => {
    const porCodigo = new Map(ERROS_FASE_A.map((e) => [e.codigo, e]));
    for (const codigo of ['PRECO_ALTERADO', 'ESTADO_INVALIDO']) {
      expect(porCodigo.get(codigo)?.estados, codigo).toEqual(['409']);
    }
  });
});

describe('realce de sintaxe', () => {
  it('JSON: chaves, strings, números e literais', () => {
    const t = realcar('{ "ok": true, "n": 3, "s": "x" }', 'json');
    expect(t.filter((x) => x.tipo === 'key').map((x) => x.texto)).toEqual(['"ok"', '"n"', '"s"']);
    expect(t.find((x) => x.tipo === 'keyword')?.texto).toBe('true');
    expect(t.find((x) => x.tipo === 'number')?.texto).toBe('3');
    expect(t.find((x) => x.tipo === 'string')?.texto).toBe('"x"');
  });

  it('bash: URL entre aspas é string, # é comentário', () => {
    const t = realcar('curl "https://api.wegest.pt/v1" # nota', 'bash');
    expect(t[0]).toEqual({ tipo: 'keyword', texto: 'curl' });
    expect(t.find((x) => x.tipo === 'string')?.texto).toBe('"https://api.wegest.pt/v1"');
    expect(t.find((x) => x.tipo === 'comment')?.texto).toBe('# nota');
  });

  it('JavaScript: // é comentário mas # não', () => {
    const t = realcar('// nota\nconst a = 1; // fim', 'javascript');
    expect(t.filter((x) => x.tipo === 'comment').map((x) => x.texto)).toEqual([
      '// nota',
      '// fim',
    ]);
    expect(
      realcar('a#b', 'javascript')
        .map((x) => x.texto)
        .join('')
    ).toBe('a#b');
  });

  it('não perde nem duplica caracteres', () => {
    const codigo = "<?php\n$ch = curl_init('https://x/v1');\n# c\n$n = 42;";
    expect(
      realcar(codigo, 'php')
        .map((x) => x.texto)
        .join('')
    ).toBe(codigo);
  });
});
