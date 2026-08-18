import { describe, it, expect } from 'vitest';
import { proximoEstado } from './tiTicketEstados';

describe('proximoEstado', () => {
  it('uma sugestão leva de aberto a com_sugestao', () => {
    expect(proximoEstado('aberto', 'sugerir')).toBe('com_sugestao');
  });

  it('foi útil resolve o ticket', () => {
    expect(proximoEstado('com_sugestao', 'foi_util')).toBe('resolvido');
  });

  it('não ajudou devolve o ticket ao admin sinalizado', () => {
    expect(proximoEstado('com_sugestao', 'nao_ajudou')).toBe('nao_resolvido');
  });

  it('depois de não ajudar, o admin pode sugerir outra vez', () => {
    expect(proximoEstado('nao_resolvido', 'sugerir')).toBe('com_sugestao');
  });

  it('depois de não ajudar, o admin pode passar a presencial', () => {
    expect(proximoEstado('nao_resolvido', 'marcar_presencial')).toBe('presencial');
  });

  it('o admin pode fechar de qualquer estado', () => {
    for (const e of ['aberto', 'com_sugestao', 'nao_resolvido', 'presencial'] as const) {
      expect(proximoEstado(e, 'fechar')).toBe('resolvido');
    }
  });

  it('do aberto, o admin pode passar a presencial', () => {
    expect(proximoEstado('aberto', 'marcar_presencial')).toBe('presencial');
  });

  it('do com_sugestao, o admin pode passar a presencial', () => {
    expect(proximoEstado('com_sugestao', 'marcar_presencial')).toBe('presencial');
  });

  it('do presencial, o admin pode sugerir outra vez', () => {
    expect(proximoEstado('presencial', 'sugerir')).toBe('com_sugestao');
  });

  // As transições proibidas importam tanto como as permitidas: sem isto, o
  // autor poderia responder "foi útil" a um ticket que ainda não tem sugestão.
  it('não se responde a uma sugestão que não existe', () => {
    expect(proximoEstado('aberto', 'foi_util')).toBeNull();
    expect(proximoEstado('aberto', 'nao_ajudou')).toBeNull();
  });

  it('um ticket resolvido não volta atrás', () => {
    expect(proximoEstado('resolvido', 'sugerir')).toBeNull();
    expect(proximoEstado('resolvido', 'nao_ajudou')).toBeNull();
  });

  it('não se responde duas vezes à mesma sugestão', () => {
    expect(proximoEstado('nao_resolvido', 'nao_ajudou')).toBeNull();
  });

  it('o admin reabre um ticket resolvido e ele volta a precisar de atenção', () => {
    expect(proximoEstado('resolvido', 'reabrir')).toBe('nao_resolvido');
  });

  // Reabrir só faz sentido a partir de resolvido. Sem estas guardas, um botão
  // mal ligado podia "reabrir" um ticket que nunca foi fechado e mandá-lo para
  // nao_resolvido sem ninguém ter tentado resolvê-lo.
  it('não se reabre o que não está resolvido', () => {
    expect(proximoEstado('aberto', 'reabrir')).toBeNull();
    expect(proximoEstado('com_sugestao', 'reabrir')).toBeNull();
    expect(proximoEstado('nao_resolvido', 'reabrir')).toBeNull();
    expect(proximoEstado('presencial', 'reabrir')).toBeNull();
  });
});
