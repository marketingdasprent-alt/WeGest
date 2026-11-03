import { describe, it, expect } from 'vitest';
import { documentosAExpirar, semanasSemRecibo } from './dashboardStats';

// Segunda-feira, 21 set 2026.
const HOJE = new Date(2026, 8, 21, 10, 0, 0);
// Sem corte: estes casos testam a regra das semanas, não a data de arranque das contas.
const SEM_CORTE = '1970-01-05';

describe('semanasSemRecibo', () => {
  it('sem data de contratação não há semanas em falta', () => {
    expect(semanasSemRecibo(null, new Set(), HOJE, SEM_CORTE)).toEqual([]);
    expect(semanasSemRecibo(undefined, new Set(), HOJE, SEM_CORTE)).toEqual([]);
  });

  it('conta só semanas completas: a semana em curso nunca entra', () => {
    // Contratado há 3 semanas (31 ago). Semanas completas: 31/08, 07/09, 14/09.
    const semanas = semanasSemRecibo('2026-08-31', new Set(), HOJE, SEM_CORTE);
    expect(semanas.map((s) => s.value)).toEqual(['2026-09-14', '2026-09-07', '2026-08-31']);
  });

  it('semanas com recibo saem da lista; a ordem é da mais recente para a mais antiga', () => {
    const semanas = semanasSemRecibo('2026-08-31', new Set(['2026-09-07']), HOJE, SEM_CORTE);
    expect(semanas.map((s) => s.value)).toEqual(['2026-09-14', '2026-08-31']);
  });

  it('a etiqueta mostra o intervalo de segunda a domingo', () => {
    const [semana] = semanasSemRecibo('2026-09-14', new Set(), HOJE, SEM_CORTE);
    expect(semana.value).toBe('2026-09-14');
    expect(semana.label).toMatch(/^14 set - 20 set 2026$/i);
  });

  it('contratado a meio da semana conta a partir da segunda-feira dessa semana', () => {
    // Quarta-feira 16 set → a semana de 14 set já conta como completa.
    const semanas = semanasSemRecibo('2026-09-16', new Set(), HOJE, SEM_CORTE);
    expect(semanas.map((s) => s.value)).toEqual(['2026-09-14']);
  });

  it('as contas só valem desde 26/10: semanas anteriores não se pedem, mesmo contratado antes', () => {
    // Segunda 09/11: semanas completas desde o corte são 26/10 e 02/11.
    const hoje = new Date(2026, 10, 9, 10, 0, 0);
    const semanas = semanasSemRecibo('2026-05-04', new Set(), hoje);
    expect(semanas.map((s) => s.value)).toEqual(['2026-11-02', '2026-10-26']);
  });

  it('contratado depois do corte conta a partir da sua própria semana', () => {
    const hoje = new Date(2026, 10, 16, 10, 0, 0);
    const semanas = semanasSemRecibo('2026-11-04', new Set(), hoje);
    expect(semanas.map((s) => s.value)).toEqual(['2026-11-09', '2026-11-02']);
  });

  it('a semana de 26/10 conta a partir de segunda 02/11, quando já acabou', () => {
    const hoje = new Date(2026, 10, 2, 10, 0, 0);
    const semanas = semanasSemRecibo('2026-05-04', new Set(), hoje);
    expect(semanas.map((s) => s.value)).toEqual(['2026-10-26']);
  });
});

describe('documentosAExpirar', () => {
  it('sem validades registadas não avisa nada', () => {
    expect(documentosAExpirar({}, HOJE)).toEqual([]);
    expect(
      documentosAExpirar(
        { carta_validade: null, documento_validade: null, licenca_tvde_validade: null },
        HOJE
      )
    ).toEqual([]);
  });

  it('avisa o que expira dentro de 30 dias e o que já expirou; ignora o que está longe', () => {
    const docs = documentosAExpirar(
      {
        carta_validade: '2026-10-15', // 24 dias → avisa
        documento_validade: '2026-09-01', // já expirou → avisa
        licenca_tvde_validade: '2027-03-01', // longe → não
      },
      HOJE
    );
    expect(docs.map((d) => [d.tipo, d.data])).toEqual([
      ['conducao', '15/10/2026'],
      ['identificacao', '01/09/2026'],
    ]);
  });

  it('o limiar de dias é configurável', () => {
    const docs = documentosAExpirar({ carta_validade: '2026-10-15' }, HOJE, 7);
    expect(docs).toEqual([]);
  });

  it('data inválida não rebenta nem avisa', () => {
    expect(documentosAExpirar({ carta_validade: 'não-é-data' }, HOJE)).toEqual([]);
  });
});
