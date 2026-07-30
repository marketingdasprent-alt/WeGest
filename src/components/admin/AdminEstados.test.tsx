import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AdminAccessDenied } from './AdminAccessDenied';
import { AdminLoadingState } from './AdminLoadingState';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

beforeEach(() => {
  mockNavigate.mockClear();
});

/**
 * Estes dois ecrãs ocupam a página inteira e aparecem em quatro páginas de
 * administração. Traziam `from-gray-900 via-black to-gray-900` com `text-white`
 * escritos à mão, pelo que um utilizador em tema claro levava um ecrã preto.
 * As classes fixas são o que estes testes travam — não a aparência.
 */
// Utilitário de cor da paleta Tailwind em vez de token do tema. Ancorado nas
// duas pontas para não apanhar `whitespace-nowrap` por conter "white".
const CLASSE_COR_FIXA =
  /^-?(bg|text|from|via|to|border|ring|fill|stroke|decoration|outline|shadow|accent|caret|divide|placeholder)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(\/\d{1,3})?$|^-?(bg|text|from|via|to|border|ring|fill|stroke)-(white|black)(\/\d{1,3})?$/;

function classesFixasEm(elemento: HTMLElement): string[] {
  const encontradas = new Set<string>();
  const todos = [elemento, ...Array.from(elemento.querySelectorAll<HTMLElement>('*'))];
  for (const no of todos) {
    for (const classe of Array.from(no.classList)) {
      if (CLASSE_COR_FIXA.test(classe)) encontradas.add(classe);
    }
  }
  return Array.from(encontradas).sort();
}

describe('o detector de cores fixas', () => {
  it('apanha exactamente as classes que estes ecrãs tinham antes', () => {
    // Sem isto, um detector que não apanhasse nada faria os dois testes
    // "não usa cores fixas" passarem sempre, sem verificarem nada.
    const antigas = [
      'from-gray-900',
      'via-black',
      'to-gray-900',
      'text-red-500',
      'text-white',
      'text-gray-400',
      'from-yellow-500',
      'to-yellow-600',
      'text-black',
    ];
    for (const classe of antigas) {
      expect(CLASSE_COR_FIXA.test(classe), classe).toBe(true);
    }
  });

  it('não confunde utilitários que só contêm o nome de uma cor', () => {
    for (const classe of ['whitespace-nowrap', 'bg-background', 'text-foreground', 'bg-primary']) {
      expect(CLASSE_COR_FIXA.test(classe), classe).toBe(false);
    }
  });
});

describe('AdminLoadingState', () => {
  it('mostra a mensagem recebida', () => {
    render(<AdminLoadingState message="A verificar permissões..." />);
    expect(screen.getByText('A verificar permissões...')).toBeTruthy();
  });

  it('anuncia a espera ao leitor de ecrã', () => {
    // Sem role="status" + aria-live, quem não vê o ícone a pulsar não recebe
    // qualquer indicação de que a página está a carregar.
    render(<AdminLoadingState message="A carregar..." />);
    const estado = screen.getByRole('status');
    expect(estado.getAttribute('aria-live')).toBe('polite');
  });

  it('não usa cores fixas — segue os tokens do tema', () => {
    const { container } = render(<AdminLoadingState message="A carregar..." />);
    expect(classesFixasEm(container)).toEqual([]);
  });
});

describe('AdminAccessDenied', () => {
  it('explica a restrição em texto, não só por cor', () => {
    // WCAG 1.4.1: o motivo tem de estar legível em texto. O ícone é decorativo.
    render(<AdminAccessDenied />);
    expect(screen.getByText('Acesso restrito')).toBeTruthy();
    expect(screen.getByText('Só administradores podem aceder a esta página.')).toBeTruthy();
  });

  it('anuncia a restrição ao leitor de ecrã', () => {
    render(<AdminAccessDenied />);
    const alerta = screen.getByRole('alert');
    expect(alerta.getAttribute('aria-live')).toBe('assertive');
  });

  it('volta ao CRM pelo router, sem recarregar a aplicação', () => {
    // Antes fazia `window.location.href = '/crm'`, o que descartava todo o
    // estado da aplicação e obrigava a um arranque completo.
    render(<AdminAccessDenied />);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao CRM' }));
    expect(mockNavigate).toHaveBeenCalledWith('/crm');
  });

  it('não usa cores fixas — segue os tokens do tema', () => {
    const { container } = render(<AdminAccessDenied />);
    expect(classesFixasEm(container)).toEqual([]);
  });
});
