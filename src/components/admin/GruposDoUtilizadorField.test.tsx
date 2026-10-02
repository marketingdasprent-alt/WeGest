import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GruposDoUtilizadorField } from './GruposDoUtilizadorField';

const GRUPOS = [
  { id: 'fat', nome: 'Faturação' },
  { id: 'tvde', nome: 'Gestor TVDE' },
  { id: 'doc', nome: 'Gestor Documental' },
];

describe('GruposDoUtilizadorField', () => {
  it('não oferece o grupo principal como adicional', () => {
    render(
      <GruposDoUtilizadorField grupos={GRUPOS} principal="fat" adicionais={[]} onChange={vi.fn()} />
    );
    expect(screen.queryByLabelText('Faturação')).toBeNull();
    expect(screen.getByLabelText('Gestor TVDE')).toBeTruthy();
    expect(screen.getByLabelText('Gestor Documental')).toBeTruthy();
  });

  it('marca os grupos adicionais que a pessoa já tem', () => {
    render(
      <GruposDoUtilizadorField
        grupos={GRUPOS}
        principal="fat"
        adicionais={['tvde']}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Gestor TVDE').getAttribute('data-state')).toBe('checked');
    expect(screen.getByLabelText('Gestor Documental').getAttribute('data-state')).toBe('unchecked');
  });

  it('juntar um grupo acrescenta-o aos adicionais, sem mexer no principal', () => {
    const onChange = vi.fn();
    render(
      <GruposDoUtilizadorField
        grupos={GRUPOS}
        principal="fat"
        adicionais={['tvde']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Gestor Documental'));
    expect(onChange).toHaveBeenCalledWith('fat', ['tvde', 'doc']);
  });

  it('tirar um grupo remove-o dos adicionais', () => {
    const onChange = vi.fn();
    render(
      <GruposDoUtilizadorField
        grupos={GRUPOS}
        principal="fat"
        adicionais={['tvde', 'doc']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Gestor TVDE'));
    expect(onChange).toHaveBeenCalledWith('fat', ['doc']);
  });
});
