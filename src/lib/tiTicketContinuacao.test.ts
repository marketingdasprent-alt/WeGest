import { describe, it, expect } from 'vitest';
import { ordenarSugestoes, resumoContinuacao } from './tiTicketContinuacao';

const sug = (created_at: string, util: boolean | null, resposta_texto: string | null = null) => ({
  created_at,
  util,
  resposta_texto,
});

describe('ordenarSugestoes', () => {
  // A query traz as sugestões pela ordem que o Postgres quiser. Sem esta
  // ordenação, "Tentativa 1" podia ser a última coisa que o admin escreveu.
  it('põe a mais antiga primeiro, seja qual for a ordem de entrada', () => {
    const fora = [sug('2026-08-20T10:00:00Z', null), sug('2026-08-18T10:00:00Z', false)];
    expect(ordenarSugestoes(fora).map((s) => s.created_at)).toEqual([
      '2026-08-18T10:00:00Z',
      '2026-08-20T10:00:00Z',
    ]);
  });

  it('não altera o array recebido', () => {
    const original = [sug('2026-08-20T10:00:00Z', null), sug('2026-08-18T10:00:00Z', false)];
    ordenarSugestoes(original);
    expect(original[0].created_at).toBe('2026-08-20T10:00:00Z');
  });
});

describe('resumoContinuacao', () => {
  it('um pedido sem sugestões está na primeira tentativa e não é continuação', () => {
    expect(resumoContinuacao([])).toEqual({
      tentativas: 0,
      proximaTentativa: 1,
      ehContinuacao: false,
      ultimaExplicacao: null,
    });
  });

  // Enquanto ninguém disse que não resolveu, não há continuação nenhuma: o
  // pedido está à espera de resposta, não à espera de segunda tentativa.
  it('uma sugestão por responder ainda não é continuação', () => {
    const r = resumoContinuacao([sug('2026-08-18T10:00:00Z', null)]);
    expect(r.ehContinuacao).toBe(false);
    expect(r.proximaTentativa).toBe(2);
  });

  it('uma sugestão que ajudou não abre continuação', () => {
    expect(resumoContinuacao([sug('2026-08-18T10:00:00Z', true)]).ehContinuacao).toBe(false);
  });

  it('uma sugestão recusada põe o pedido na segunda tentativa', () => {
    const r = resumoContinuacao([sug('2026-08-18T10:00:00Z', false, 'continua a desligar-se')]);
    expect(r).toEqual({
      tentativas: 1,
      proximaTentativa: 2,
      ehContinuacao: true,
      ultimaExplicacao: 'continua a desligar-se',
    });
  });

  it('conta as tentativas todas quando o pedido já voltou duas vezes', () => {
    const r = resumoContinuacao([
      sug('2026-08-18T10:00:00Z', false, 'não deu'),
      sug('2026-08-19T10:00:00Z', false, 'também não'),
    ]);
    expect(r.tentativas).toBe(2);
    expect(r.proximaTentativa).toBe(3);
    expect(r.ultimaExplicacao).toBe('também não');
  });

  // A explicação é opcional: quem recusa pode carregar no botão e não escrever
  // nada. O admin tem de conseguir distinguir "não explicou" de "explicou".
  it('a explicação é nula quando o autor recusou sem escrever', () => {
    const r = resumoContinuacao([sug('2026-08-18T10:00:00Z', false, '   ')]);
    expect(r.ehContinuacao).toBe(true);
    expect(r.ultimaExplicacao).toBeNull();
  });

  // Sem isto, uma recusa antiga com texto sobrepunha-se à recusa mais recente
  // sem texto, e o admin lia uma explicação que já não era a do último ciclo.
  it('a explicação vem da recusa mais recente, mesmo que essa venha vazia', () => {
    const r = resumoContinuacao([
      sug('2026-08-18T10:00:00Z', false, 'primeira explicação'),
      sug('2026-08-19T10:00:00Z', false, null),
    ]);
    expect(r.ultimaExplicacao).toBeNull();
  });

  it('lê pela data e não pela ordem do array', () => {
    const r = resumoContinuacao([
      sug('2026-08-19T10:00:00Z', false, 'a mais recente'),
      sug('2026-08-18T10:00:00Z', false, 'a mais antiga'),
    ]);
    expect(r.ultimaExplicacao).toBe('a mais recente');
  });
});
