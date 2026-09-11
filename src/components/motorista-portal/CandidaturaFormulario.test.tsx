import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Candidatura } from '@/pages/motorista/PainelMotorista';

// ---------------------------------------------------------------------------
// O que estes testes protegem
//
// O upload de um documento gravava a URL na BD só quando JÁ existia linha de
// candidatura. Para o candidato a preencher pela primeira vez (que é quem
// carrega documentos) a função desistia em silêncio: o ficheiro subia para o
// Storage, o ecrã dizia "Upload concluído" e a URL ficava apenas em memória.
// Quem saísse antes de carregar em "Guardar" perdia o documento — ficava órfão
// no bucket, invisível para o gestor e para o próprio.
// ---------------------------------------------------------------------------

const upsert = vi.fn();
const update = vi.fn();
const toast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'ze@x.pt', user_metadata: {} },
    signOut: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      upsert: (...args: unknown[]) => upsert(...args),
      update: (...args: unknown[]) => {
        update(...args);
        return { eq: () => ({ select: () => updateResult }) };
      },
    }),
  },
}));

// Resultado que o .update(...).eq(...).select() devolve — controlado por teste.
let updateResult: { data: unknown[] | null; error: unknown } = {
  data: [{ id: 'c1' }],
  error: null,
};

// As secções reais só interessam aqui como forma de disparar onUploadToDb.
vi.mock('./candidatura/sections', () => ({
  DadosPessoaisSection: ({ onUploadToDb }: { onUploadToDb: (c: string, u: string) => void }) => (
    <button onClick={() => onUploadToDb('comprovativo_morada_url', 'user-1/morada/1.pdf')}>
      SIMULAR-UPLOAD
    </button>
  ),
  CartaConducaoSection: () => null,
  DocumentosSection: () => null,
  SubmissaoSection: () => null,
}));

import { CandidaturaFormulario } from './CandidaturaFormulario';

function candidaturaFake(over: Partial<Candidatura> = {}): Candidatura {
  return {
    id: 'c1',
    user_id: 'user-1',
    nome: 'Zé',
    email: 'ze@x.pt',
    telefone: null,
    nif: null,
    morada: null,
    codigo_postal: null,
    cidade: null,
    documento_tipo: null,
    documento_numero: null,
    documento_validade: null,
    documento_ficheiro_url: null,
    documento_identificacao_verso_url: null,
    carta_conducao: null,
    carta_categorias: null,
    carta_validade: null,
    carta_ficheiro_url: null,
    carta_conducao_verso_url: null,
    licenca_tvde_numero: null,
    licenca_tvde_validade: null,
    licenca_tvde_ficheiro_url: null,
    registo_criminal_url: null,
    comprovativo_morada_url: null,
    comprovativo_iban_url: null,
    outros_documentos: [],
    status: 'rascunho',
    data_submissao: null,
    data_decisao: null,
    motivo_rejeicao: null,
    observacoes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Candidatura;
}

describe('CandidaturaFormulario — upload guarda sempre a URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    updateResult = { data: [{ id: 'c1' }], error: null };
    upsert.mockResolvedValue({ error: null });
  });

  it('sem candidatura ainda criada, o upload cria o rascunho em vez de se perder', async () => {
    render(<CandidaturaFormulario candidatura={null} onUpdate={() => {}} />);

    fireEvent.click(screen.getByText('SIMULAR-UPLOAD'));

    await waitFor(() => expect(upsert).toHaveBeenCalled());
    const [linha, opcoes] = upsert.mock.calls[0] as [
      Record<string, unknown>,
      { onConflict: string },
    ];
    expect(linha.user_id).toBe('user-1');
    expect(linha.comprovativo_morada_url).toBe('user-1/morada/1.pdf');
    // Rascunho: não dispara o aviso de "novo motorista pendente" ao gestor.
    expect(linha.status).toBe('rascunho');
    // Dois uploads em paralelo não podem criar duas candidaturas.
    expect(opcoes.onConflict).toBe('user_id');
    expect(toast).not.toHaveBeenCalled();
  });

  it('com candidatura existente faz update e não cria uma segunda linha', async () => {
    render(<CandidaturaFormulario candidatura={candidaturaFake()} onUpdate={() => {}} />);

    fireEvent.click(screen.getByText('SIMULAR-UPLOAD'));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toEqual({ comprovativo_morada_url: 'user-1/morada/1.pdf' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('se a RLS recusar (0 linhas), avisa em vez de dizer que correu bem', async () => {
    updateResult = { data: [], error: null };
    render(<CandidaturaFormulario candidatura={candidaturaFake()} onUpdate={() => {}} />);

    fireEvent.click(screen.getByText('SIMULAR-UPLOAD'));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatchObject({ variant: 'destructive' });
  });
});
