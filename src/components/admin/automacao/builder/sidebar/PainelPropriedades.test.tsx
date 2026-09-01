import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PainelPropriedades } from './PainelPropriedades';
import type { AutomationNode } from '../dominio/tipos';

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

const testarMutateAsync = vi.fn();
vi.mock('@/hooks/automacao/useAutomationRulesConfig', async () => {
  const real = await vi.importActual<typeof import('@/hooks/automacao/useAutomationRulesConfig')>(
    '@/hooks/automacao/useAutomationRulesConfig'
  );
  return {
    ...real,
    useAutomationRuleConfig: () => ({ data: { event_type: 'viatura.seguro_expirando' } }),
    useTestarRegra: () => ({ mutateAsync: testarMutateAsync, isPending: false }),
  };
});

let ultimoPayload: Record<string, unknown> | null = { matricula: 'AA-00-AA' };
vi.mock('@/hooks/automacao/useUltimoPayloadDaRegra', () => ({
  useUltimoPayloadDaRegra: () => ({ data: ultimoPayload }),
}));

vi.mock('@/hooks/automacao/useTemplateDaRegra', () => ({
  useTemplateDaRegra: () => ({ data: null }),
  useGuardarTemplate: () => ({ mutateAsync: vi.fn() }),
}));

function renderPainel(overrides: Partial<AutomationNode> = {}) {
  const no = {
    id: 'no-1',
    type: 'accao',
    position: { x: 0, y: 0 },
    data: { rotulo: 'Enviar email', acaoTipo: 'email' },
    ...overrides,
  } as AutomationNode;

  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <PainelPropriedades
        no={no}
        regraId="regra-1"
        onFechar={vi.fn()}
        onGuardarFluxo={vi.fn().mockResolvedValue(undefined)}
      />
    </QueryClientProvider>
  );
}

describe('PainelPropriedades — botão Testar', () => {
  beforeEach(() => {
    testarMutateAsync.mockReset();
    toastMock.mockReset();
    ultimoPayload = { matricula: 'AA-00-AA' };
  });

  it('aparece para uma acção de email', () => {
    renderPainel();
    expect(screen.getByRole('button', { name: /testar/i })).toBeInTheDocument();
  });

  it('não aparece para um gatilho', () => {
    renderPainel({ type: 'trigger', data: { rotulo: 'Gatilho' } });
    expect(screen.queryByRole('button', { name: /testar/i })).not.toBeInTheDocument();
  });

  it('fica desactivado sem payload anterior', () => {
    ultimoPayload = null;
    renderPainel();
    expect(screen.getByRole('button', { name: /testar/i })).toBeDisabled();
  });

  it('guarda e depois chama o teste, mostrando o resultado num toast', async () => {
    testarMutateAsync.mockResolvedValue({
      notificacao_id: 'notif-1',
      email_enviado: true,
      email_teste: 'eu@empresa.pt',
      payload_de: '2026-08-30T10:00:00Z',
      destinatarios_reais: [{ nome: 'Maria', email: 'maria@empresa.pt', motivo: 'admin' }],
    });

    renderPainel();
    fireEvent.click(screen.getByRole('button', { name: /testar/i }));

    await waitFor(() => expect(testarMutateAsync).toHaveBeenCalledWith('regra-1'));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringMatching(/teste enviado/i) })
      )
    );
  });

  it('mostra um toast de erro quando o teste falha', async () => {
    testarMutateAsync.mockRejectedValue(
      new Error('Esta automação ainda não correu — não há dados para testar.')
    );

    renderPainel();
    fireEvent.click(screen.getByRole('button', { name: /testar/i }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
    );
  });
});
