import { describe, expect, it } from 'vitest';
import type { FieldErrors, FieldValues } from 'react-hook-form';
import { avisoGravacaoInvalida, resumoErrosMotorista } from './resumoErrosMotorista';

const erros = (e: Record<string, unknown>) => e as unknown as FieldErrors<FieldValues>;

describe('resumoErrosMotorista', () => {
  it('nomeia o campo antes da mensagem, porque o erro fica longe do botão', () => {
    expect(
      resumoErrosMotorista(erros({ email: { type: 'too_small', message: 'Email é obrigatório' } }))
    ).toBe('Email: Email é obrigatório');
  });

  it('erro sem mensagem continua a dizer qual é o campo', () => {
    expect(resumoErrosMotorista(erros({ nif: { type: 'custom', message: '' } }))).toBe(
      'NIF: preenchimento inválido'
    );
  });

  it('erro dentro de um item do array (forma real do zod) traz a mensagem do item', () => {
    expect(
      resumoErrosMotorista(
        erros({
          carta_categorias: [undefined, { type: 'invalid_type', message: 'Categoria inválida' }],
        })
      )
    ).toBe('Categorias da carta: Categoria inválida');
  });

  it('não desce no ref (elemento do DOM)', () => {
    const ref = { message: 'isto é do DOM, não do erro' };
    expect(resumoErrosMotorista(erros({ email: { type: 'x', ref } }))).toBe(
      'Email: preenchimento inválido'
    );
  });

  it('erro do superRefine no número do documento sai com o rótulo do campo', () => {
    expect(
      resumoErrosMotorista(
        erros({ documento_numero: { type: 'custom', message: 'Número de documento inválido' } })
      )
    ).toBe('Nº do documento: Número de documento inválido');
  });

  it('campo desconhecido aparece pelo nome técnico em vez de sumir', () => {
    expect(resumoErrosMotorista(erros({ campo_novo: { message: 'Inválido' } }))).toBe(
      'campo_novo: Inválido'
    );
  });

  it('junta vários, corta em 5 e diz quantos ficaram de fora', () => {
    const muitos = erros({
      nif: { message: 'NIF inválido' },
      email: { message: 'Email é obrigatório' },
      telefone: { message: 'Telefone é obrigatório' },
      iban: { message: 'IBAN é obrigatório' },
      documento_tipo: { message: 'Tipo de documento é obrigatório' },
      documento_validade: { message: 'Validade é obrigatória' },
    });
    expect(resumoErrosMotorista(muitos)).toBe(
      'NIF: NIF inválido · Email: Email é obrigatório · Telefone: Telefone é obrigatório · ' +
        'IBAN: IBAN é obrigatório · Tipo de documento: Tipo de documento é obrigatório (+1)'
    );
  });

  it('sem erros devolve vazio', () => {
    expect(resumoErrosMotorista(erros({}))).toBe('');
  });
});

describe('avisoGravacaoInvalida', () => {
  it('diz porque não gravou e quais os campos', () => {
    expect(avisoGravacaoInvalida(erros({ iban: { message: 'IBAN é obrigatório' } }))).toEqual({
      titulo: 'Não foi possível guardar: há campos por corrigir na ficha',
      descricao: 'IBAN: IBAN é obrigatório',
    });
  });

  it('sem detalhe cai numa frase que ainda aponta para os campos assinalados', () => {
    expect(avisoGravacaoInvalida(erros({})).descricao).toBe(
      'Verifica os campos assinalados a vermelho na ficha.'
    );
  });
});
