import { describe, it, expect } from 'vitest';

import {
  contarInativosEscondidos,
  ehInativo,
  inativoVisivelNoResumo,
} from './motoristasInativosResumo';

const SEMANA = new Date('2026-09-21T00:00:00');
const ctx = {
  statusAtivoMap: { ativo: true, saiu: false, saiuAntes: false, semData: false },
  desativadoEmMap: { saiu: '2026-09-29', saiuAntes: '2026-08-01' },
  weekStart: SEMANA,
};
const linha = (motorista_id: string, liquido = -100) => ({
  motorista_id,
  liquido,
  total_faturado: 300,
});

describe('ehInativo', () => {
  it('só quem tem a ficha marcada inativa', () => {
    expect(ehInativo('saiu', ctx.statusAtivoMap)).toBe(true);
    expect(ehInativo('ativo', ctx.statusAtivoMap)).toBe(false);
    expect(ehInativo('desconhecido', ctx.statusAtivoMap)).toBe(false);
    expect(ehInativo(null, ctx.statusAtivoMap)).toBe(false);
  });
});

describe('inativoVisivelNoResumo', () => {
  it('por omissão os inativos não aparecem; os activos sempre', () => {
    const c = { ...ctx, mostrarInativos: false };
    expect(inativoVisivelNoResumo(linha('saiu'), c)).toBe(false);
    expect(inativoVisivelNoResumo(linha('ativo'), c)).toBe(true);
  });

  it('com "Mostrar inativos": quem saiu nesta semana ou depois, e com valores', () => {
    const c = { ...ctx, mostrarInativos: true };
    expect(inativoVisivelNoResumo(linha('saiu'), c)).toBe(true);
    expect(inativoVisivelNoResumo(linha('saiu', 0), c)).toBe(true); // ainda tem faturado
    expect(inativoVisivelNoResumo({ motorista_id: 'saiu', liquido: 0, total_faturado: 0 }, c)).toBe(
      false
    );
  });

  it('quem saiu antes desta semana, ou sem data de saída, nunca aparece', () => {
    const c = { ...ctx, mostrarInativos: true };
    expect(inativoVisivelNoResumo(linha('saiuAntes'), c)).toBe(false);
    expect(inativoVisivelNoResumo(linha('semData'), c)).toBe(false);
  });
});

describe('contarInativosEscondidos', () => {
  it('conta só os que o interruptor traria de volta', () => {
    const linhas = [linha('ativo'), linha('saiu'), linha('saiuAntes'), linha('semData')];
    expect(contarInativosEscondidos(linhas, ctx)).toBe(1);
  });
});
