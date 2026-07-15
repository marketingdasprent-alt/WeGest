import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { fillEmptyFormFields } from './fillEmptyFormFields';

interface TestForm {
  kms_incluidos: number | null;
  franquia_valor: number | null;
}

describe('fillEmptyFormFields', () => {
  it('preenche um campo vazio (null) com o valor candidato', () => {
    const { result } = renderHook(() =>
      useForm<TestForm>({ defaultValues: { kms_incluidos: null, franquia_valor: null } })
    );
    act(() => {
      fillEmptyFormFields(result.current, { kms_incluidos: 3000, franquia_valor: 500 });
    });
    expect(result.current.getValues('kms_incluidos')).toBe(3000);
    expect(result.current.getValues('franquia_valor')).toBe(500);
  });

  it('nunca sobrescreve um campo já preenchido, mesmo com um candidato diferente', () => {
    const { result } = renderHook(() =>
      useForm<TestForm>({ defaultValues: { kms_incluidos: 2000, franquia_valor: null } })
    );
    act(() => {
      fillEmptyFormFields(result.current, { kms_incluidos: 3000, franquia_valor: 500 });
    });
    expect(result.current.getValues('kms_incluidos')).toBe(2000);
    expect(result.current.getValues('franquia_valor')).toBe(500);
  });

  it('ignora candidatos null/undefined sem tocar no campo', () => {
    const { result } = renderHook(() =>
      useForm<TestForm>({ defaultValues: { kms_incluidos: null, franquia_valor: null } })
    );
    act(() => {
      fillEmptyFormFields(result.current, { kms_incluidos: null, franquia_valor: undefined });
    });
    expect(result.current.getValues('kms_incluidos')).toBeNull();
    expect(result.current.getValues('franquia_valor')).toBeNull();
  });
});
