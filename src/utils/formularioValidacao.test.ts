import { describe, expect, it } from 'vitest';
import type { FormField } from '@/components/formularios/DynamicFieldEditor';
import { errosDosCampos } from './formularioValidacao';

const campo = (id: string, type: FormField['type'], required = true): FormField => ({
  id,
  type,
  label: id,
  required,
});

describe('errosDosCampos', () => {
  const campos = [campo('Nome', 'text'), campo('Telefone', 'tel')];

  it('sem erros com tudo certo', () => {
    expect(errosDosCampos(campos, { Nome: 'Ana', Telefone: '+351 962145678' })).toEqual({});
  });

  it('obrigatório vazio dá erro', () => {
    expect(errosDosCampos(campos, { Telefone: '+351 962145678' })).toEqual({
      Nome: 'Nome é obrigatório',
    });
  });

  it('telefone com o indicativo dentro do número é recusado', () => {
    const erros = errosDosCampos(campos, { Nome: 'Ana', Telefone: '+351 351962145' });
    expect(Object.keys(erros)).toEqual(['Telefone']);
  });

  it('telefone opcional vazio passa, preenchido é validado', () => {
    const opcional = [campo('Tel', 'phone', false)];
    expect(errosDosCampos(opcional, {})).toEqual({});
    expect(errosDosCampos(opcional, { Tel: '+351 12' })).toHaveProperty('Tel');
  });
});
