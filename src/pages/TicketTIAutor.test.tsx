import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import TicketTIAutor from './TicketTIAutor';
import { supabase } from '@/integrations/supabase/client';

function renderComToken(dados: unknown) {
  (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: dados,
    error: null,
  });
  return render(
    <MemoryRouter initialEntries={['/ti-autor/tok-1']}>
      <Routes>
        <Route path="/ti-autor/:acessoToken" element={<TicketTIAutor />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TicketTIAutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra a data e hora de quando o pedido foi feito', async () => {
    renderComToken({
      success: true,
      ticket: {
        numero: 5,
        autor_nome: 'Bruno Paulo',
        descricao: 'O portátil não liga',
        status: 'aberto',
        created_at: '2026-09-01T14:07:00Z',
      },
      sugestoes: [],
    });

    await waitFor(() => expect(screen.getByText('Pedido #5')).toBeInTheDocument());
    // O offset local não interessa para o teste — só que a data/hora aparece,
    // formatada como dd/MM/yyyy HH:mm.
    expect(screen.getByText(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('mostra a data e hora de cada sugestão', async () => {
    renderComToken({
      success: true,
      ticket: {
        numero: 5,
        autor_nome: 'Bruno Paulo',
        descricao: 'O portátil não liga',
        status: 'com_sugestao',
        created_at: '2026-09-01T14:07:00Z',
      },
      sugestoes: [
        {
          id: 's1',
          texto: 'Reinicie o portátil',
          util: null,
          resposta_texto: null,
          created_at: '2026-09-01T15:30:00Z',
        },
      ],
    });

    await waitFor(() => expect(screen.getByText('Reinicie o portátil')).toBeInTheDocument());
    const datas = screen.getAllByText(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    // Uma para o pedido, outra para a sugestão.
    expect(datas).toHaveLength(2);
  });

  it('mostra a data e hora de quando a sugestão foi respondida', async () => {
    renderComToken({
      success: true,
      ticket: {
        numero: 5,
        autor_nome: 'Bruno Paulo',
        descricao: 'O portátil não liga',
        status: 'resolvido',
        created_at: '2026-09-01T14:07:00Z',
      },
      sugestoes: [
        {
          id: 's1',
          texto: 'Reinicie o portátil',
          util: true,
          resposta_texto: null,
          created_at: '2026-09-01T15:30:00Z',
          respondida_em: '2026-09-01T16:00:00Z',
        },
      ],
    });

    await waitFor(() => expect(screen.getByText(/Marcou como: resolveu/)).toBeInTheDocument());
    expect(
      screen.getByText(/Marcou como: resolveu.*\(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\)/)
    ).toBeInTheDocument();
  });
});
