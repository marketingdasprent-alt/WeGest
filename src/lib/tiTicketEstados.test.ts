import { describe, it, expect } from 'vitest';
import { proximoEstado } from './tiTicketEstados';

describe('proximoEstado', () => {
  it('uma sugestao leva de aberto a com_sugestao', () => {
    expect(proximoEstado('aberto', 'sugerir')).toBe('com_sugestao');
  });

  it('foi util resolve o ticket', () => {
    expect(proximoEstado('com_sugestao', 'foi_util')).toBe('resolvido');
  });

  it('nao ajudou devolve o ticket ao admin sinalizado', () => {
    expect(proximoEstado('com_sugestao', 'nao_ajudou')).toBe('nao_resolvido');
  });

  it('depois de nao ajudar, o admin pode sugerir outra vez', () => {
    expect(proximoEstado('nao_resolvido', 'sugerir')).toBe('com_sugestao');
  });

  it('depois de nao ajudar, o admin pode passar a presencial', () => {
    expect(proximoEstado('nao_resolvido', 'marcar_presencial')).toBe('presencial');
  });

  it('o admin pode fechar de qualquer estado', () => {
    for (const e of ['aberto', 'com_sugestao', 'nao_resolvido', 'presencial'] as const) {
      expect(proximoEstado(e, 'fechar')).toBe('resolvido');
    }
  });

  // As transicoes proibidas importam tanto como as permitidas: sem isto, o
  // autor poderia responder "foi util" a um ticket que ainda nao tem sugestao.
  it('nao se responde a uma sugestao que nao existe', () => {
    expect(proximoEstado('aberto', 'foi_util')).toBeNull();
    expect(proximoEstado('aberto', 'nao_ajudou')).toBeNull();
  });

  it('um ticket resolvido nao volta atras', () => {
    expect(proximoEstado('resolvido', 'sugerir')).toBeNull();
    expect(proximoEstado('resolvido', 'nao_ajudou')).toBeNull();
  });

  it('nao se responde duas vezes a mesma sugestao', () => {
    expect(proximoEstado('nao_resolvido', 'nao_ajudou')).toBeNull();
  });
});
