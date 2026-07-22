import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const signUp = vi.fn();
const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { signUp: (...a: unknown[]) => signUp(...a) },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));

const resolveOrgByCodigo = vi.fn();
vi.mock('@/lib/org-codigo', () => ({
  resolveOrgByCodigo: (...a: unknown[]) => resolveOrgByCodigo(...a),
  normalizeCodigo: (s: string) => s.trim().toLowerCase(),
}));

const isNativeApp = vi.fn(() => false);
vi.mock('@/lib/native', () => ({
  isNativeApp: () => isNativeApp(),
  getEmailRedirectUrl: (p: string) => `https://wegest.pt${p}`,
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
// O componente usa useDefaultRoute (redirect por papel) — com user=null aqui,
// não redireciona; mockar evita montar PermissionsProvider neste teste.
vi.mock('@/hooks/useDefaultRoute', () => ({
  useDefaultRoute: () => ({ defaultRoute: null, loading: false }),
}));

import RegistoMotorista from './RegistoMotorista';

// Rotas-alvo mockadas para poder verificar PARA ONDE o registo redireciona
// (painel direto vs. login a pedir confirmação de email) sem montar as
// páginas reais.
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/motorista/registo" element={<RegistoMotorista />} />
        <Route path="/motorista/painel" element={<div>PAINEL-MOCK</div>} />
        <Route path="/motorista/login" element={<div>LOGIN-MOCK</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function continuarComEmail(email = 'ze@x.pt') {
  fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: /Continuar/i }));
}

async function preencherCriar() {
  fireEvent.change(screen.getByLabelText(/^Palavra-passe$/i), { target: { value: 'abcd1234' } });
  fireEvent.change(screen.getByLabelText(/Confirmar palavra-passe/i), {
    target: { value: 'abcd1234' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Criar conta/i }));
}

describe('RegistoMotorista (web) — email-first', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativeApp.mockReturnValue(false);
    invoke.mockResolvedValue({ data: { ok: true, status: 'criar' }, error: null });
    signUp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  });

  it('sem ?org= mostra erro e não permite continuar', async () => {
    renderAt('/motorista/registo');
    expect(await screen.findByText(/Link inválido/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Continuar/i })).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('com ?org= inválido mostra erro e não chama a edge function', async () => {
    resolveOrgByCodigo.mockResolvedValue(null);
    renderAt('/motorista/registo?org=nope');
    expect(await screen.findByText(/empresa não.*encontrada|Link inválido/i)).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('status "criar" → mostra só password (nome/telefone ficam para a candidatura) e cria conta com org_id/tipo motorista', async () => {
    resolveOrgByCodigo.mockResolvedValue({ id: 'org-x', nome: 'Empresa X' });
    invoke.mockResolvedValue({ data: { ok: true, status: 'criar' }, error: null });
    renderAt('/motorista/registo?org=empresa-x');
    await screen.findByText(/Empresa X/i);

    await continuarComEmail('novo@x.pt');
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    // Ramo "sem perfil" → só cria a conta; sem campos de Nome/Telefone.
    await screen.findByLabelText(/^Palavra-passe$/i);
    expect(screen.queryByLabelText(/Nome completo/i)).toBeNull();
    expect(screen.queryByLabelText(/Telefone/i)).toBeNull();

    await preencherCriar();
    await waitFor(() => expect(signUp).toHaveBeenCalled());
    const arg = signUp.mock.calls[0][0];
    expect(arg.email).toBe('novo@x.pt');
    expect(arg.options.data.org_id).toBe('org-x');
    expect(arg.options.data.tipo_utilizador).toBe('motorista');
    expect(arg.options.data.nome).toBeUndefined();
    expect(arg.options.data.telefone).toBeUndefined();
  });

  it('signUp com sessão ativa (confirmação de email desligada) → vai direto para o painel', async () => {
    resolveOrgByCodigo.mockResolvedValue({ id: 'org-x', nome: 'Empresa X' });
    invoke.mockResolvedValue({ data: { ok: true, status: 'criar' }, error: null });
    signUp.mockResolvedValue({
      data: { user: { id: 'u1' }, session: { access_token: 'tok' } },
      error: null,
    });
    renderAt('/motorista/registo?org=empresa-x');
    await screen.findByText(/Empresa X/i);

    await continuarComEmail('novo@x.pt');
    await screen.findByLabelText(/^Palavra-passe$/i);
    await preencherCriar();

    expect(await screen.findByText(/PAINEL-MOCK/i)).toBeTruthy();
  });

  it('signUp sem sessão (a aguardar confirmação de email) → vai para o login', async () => {
    resolveOrgByCodigo.mockResolvedValue({ id: 'org-x', nome: 'Empresa X' });
    invoke.mockResolvedValue({ data: { ok: true, status: 'criar' }, error: null });
    signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });
    renderAt('/motorista/registo?org=empresa-x');
    await screen.findByText(/Empresa X/i);

    await continuarComEmail('novo@x.pt');
    await screen.findByLabelText(/^Palavra-passe$/i);
    await preencherCriar();

    expect(await screen.findByText(/LOGIN-MOCK/i)).toBeTruthy();
  });

  it('status "enviado" → NÃO faz signUp e mostra "verifique o email"', async () => {
    resolveOrgByCodigo.mockResolvedValue({ id: 'org-x', nome: 'Empresa X' });
    invoke.mockResolvedValue({ data: { ok: true, status: 'enviado' }, error: null });
    renderAt('/motorista/registo?org=empresa-x');
    await screen.findByText(/Empresa X/i);

    await continuarComEmail('existente@x.pt');

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    const [fn, opts] = invoke.mock.calls[0];
    expect(fn).toBe('motorista-onboarding');
    expect(opts.body.email).toBe('existente@x.pt');
    expect(opts.body.org_id).toBe('org-x');
    expect(signUp).not.toHaveBeenCalled();
    expect(await screen.findByText(/Verifique o seu email/i)).toBeTruthy();
  });

  it('status "existe_conta" → NÃO faz signUp e encaminha para login', async () => {
    resolveOrgByCodigo.mockResolvedValue({ id: 'org-x', nome: 'Empresa X' });
    invoke.mockResolvedValue({ data: { ok: true, status: 'existe_conta' }, error: null });
    renderAt('/motorista/registo?org=empresa-x');
    await screen.findByText(/Empresa X/i);

    await continuarComEmail('jacomconta@x.pt');

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(signUp).not.toHaveBeenCalled();
    expect(await screen.findByText(/Já tem uma conta/i)).toBeTruthy();
  });
});

describe('RegistoMotorista (nativa)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativeApp.mockReturnValue(true);
    invoke.mockResolvedValue({ data: { ok: true, status: 'criar' }, error: null });
    signUp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  });

  it('sem código preenchido não chama a edge function', async () => {
    renderAt('/motorista/registo');
    await continuarComEmail();
    expect(invoke).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('com código resolve a org e chama a edge function com o email', async () => {
    resolveOrgByCodigo.mockResolvedValue({ id: 'org-y', nome: 'Empresa Y' });
    renderAt('/motorista/registo');
    fireEvent.change(screen.getByLabelText(/Código da empresa/i), {
      target: { value: 'empresa-y' },
    });
    await continuarComEmail('ze@y.pt');
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    const [, opts] = invoke.mock.calls[0];
    expect(opts.body.org_id).toBe('org-y');
    expect(opts.body.email).toBe('ze@y.pt');
  });
});
