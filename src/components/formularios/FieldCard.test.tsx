// src/components/formularios/FieldCard.test.tsx
// Regressão: o mapa de ícones não tinha entrada para 'phone' ("Telefone (com
// código país)"), que o selector de tipos oferece na mesma. Escolher esse tipo
// no criador de formulários renderizava <undefined /> e deitava a página
// abaixo com o React error #130 — o utilizador via o ecrã "Esta secção não
// conseguiu abrir" em vez do formulário.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldCard } from './FieldCard';
import type { FormField } from './DynamicFieldEditor';

const TIPOS: FormField['type'][] = [
  'text',
  'email',
  'tel',
  'phone',
  'textarea',
  'select',
  'date',
  'checkbox',
  'radio',
];

function campo(type: FormField['type']): FormField {
  return { id: `campo-${type}`, type, label: `Campo ${type}`, required: false };
}

function renderCard(field: FormField) {
  return render(
    <FieldCard
      field={field}
      isEditing={false}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onUpdate={vi.fn()}
    />
  );
}

describe('FieldCard — ícone por tipo de campo', () => {
  it.each(TIPOS)('renderiza sem rebentar com o tipo "%s"', (type) => {
    renderCard(campo(type));
    expect(screen.getByText(`Campo ${type}`)).toBeInTheDocument();
  });

  it('aguenta um tipo desconhecido vindo da base de dados', () => {
    // `campos` é JSON na base: um tipo antigo ou escrito à mão não pode
    // voltar a deitar o ecrã abaixo.
    renderCard({ ...campo('text'), type: 'inexistente' as FormField['type'] });
    expect(screen.getByText('Campo text')).toBeInTheDocument();
  });
});
