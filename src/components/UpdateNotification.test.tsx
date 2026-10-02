import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { EVENTO_VERSAO_NOVA } from '@/lib/pwaArranque';
import { UpdateNotification } from './UpdateNotification';

describe('UpdateNotification', () => {
  afterEach(() => {
    delete window.__swUpdate;
  });

  it('não aparece sem versão nova', () => {
    render(<UpdateNotification />);
    expect(screen.queryByText('Nova versão disponível')).toBeNull();
  });

  it('aparece quando o main.tsx emite o evento de versão nova', () => {
    render(<UpdateNotification />);
    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_VERSAO_NOVA));
    });
    expect(screen.getByText('Nova versão disponível')).toBeTruthy();
  });

  it('aparece logo se o evento saiu antes da montagem (__swUpdate já definido)', () => {
    window.__swUpdate = async () => undefined;
    render(<UpdateNotification />);
    expect(screen.getByText('Nova versão disponível')).toBeTruthy();
  });
});
