import { describe, expect, it } from 'vitest';
import { formatarMatricula, observacoesIniciais, observacoesParaEmitir } from './observacoesFatura';

describe('formatarMatricula', () => {
  it('normaliza para XX-XX-XX', () => {
    expect(formatarMatricula('bn90pd')).toBe('BN-90-PD');
    expect(formatarMatricula('BN-90-PD')).toBe('BN-90-PD');
    expect(formatarMatricula(' bn 90 pd ')).toBe('BN-90-PD');
  });

  it('deixa como veio o que não tem forma de matrícula', () => {
    expect(formatarMatricula('12-AB-345')).toBe('12-AB-345');
    expect(formatarMatricula(null)).toBe('');
  });
});

describe('observacoesIniciais', () => {
  it('matrícula primeiro, notas externas a seguir', () => {
    expect(observacoesIniciais({ matricula: 'bn90pd', notasExternas: 'Entrega em Leiria' })).toBe(
      'Matrícula BN-90-PD\nEntrega em Leiria'
    );
  });

  it('sem matrícula ficam só as notas; sem nada fica vazio', () => {
    expect(observacoesIniciais({ notasExternas: ' nota ' })).toBe('nota');
    expect(observacoesIniciais({ matricula: null, notasExternas: null })).toBe('');
  });
});

describe('observacoesParaEmitir', () => {
  it('limpa espaços e linhas vazias repetidas, mantém o que o utilizador escreveu', () => {
    expect(observacoesParaEmitir('  Matrícula BN-90-PD \n\n\n Caução devolvida ')).toBe(
      'Matrícula BN-90-PD\n\nCaução devolvida'
    );
  });

  it('vazio não segue para o emissor', () => {
    expect(observacoesParaEmitir('')).toBeUndefined();
    expect(observacoesParaEmitir('  \n ')).toBeUndefined();
    expect(observacoesParaEmitir(null)).toBeUndefined();
  });
});
