import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const signUp = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signUp: (...a: unknown[]) => signUp(...a) } },
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

vi.mock('@/components/ui/phone-input', () => ({
  PhoneInput: (p: any) => (
    <input aria-label="Telefone" value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  ),
  validatePhoneNumber: () => true,
}));

import RegistoMotorista from './RegistoMotorista';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RegistoMotorista />
    </MemoryRouter>
  );
}

async function preencherEsubmeter() {
  fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Zé' } });
  fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'ze@x.pt' } });
  fireEvent.change(screen.getByLabelText(/Telefone/i), { target: { value: '+351912345678' } });
  fireEvent.change(screen.getByLabelText(/^Palavra-passe$/i), { target: { value: 'abcd1234' } });
  fireEvent.change(screen.getByLabelText(/Confirmar palavra-passe/i), {
    target: { value: 'abcd1234' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Criar conta/i }));
}

describe('RegistoMotorista (web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativeApp.mockReturnValue(false);
    signUp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  });

  it('sem ?org= mostra erro e não permite registar', async () => {
    renderAt('/motorista/registo');
    expect(await screen.findByText(/Link inválido/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Criar conta/i })).toBeNull();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('com ?org= inválido mostra erro e não permite registar', async () => {
    resolveOrgByCodigo.mockResolvedValue(null);
    renderAt('/motorista/registo?org=nope');
    expect(await screen.findByText(/empresa não.*encontrada|Link inválido/i)).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('com ?org= válido injeta org_id no signUp', async () => {
    resolveOrgByCodigo.mockResolvedValue({ id: 'org-x', nome: 'Empresa X' });
    renderAt('/motorista/registo?org=empresa-x');
    await screen.findByText(/Empresa X/i);
    await preencherEsubmeter();
    await waitFor(() => expect(signUp).toHaveBeenCalled());
    const arg = signUp.mock.calls[0][0];
    expect(arg.options.data.org_id).toBe('org-x');
    expect(arg.options.data.tipo_utilizador).toBe('motorista');
  });
});

describe('RegistoMotorista (nativa)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativeApp.mockReturnValue(true);
    signUp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  });

  it('sem ?org= mostra campo de código e resolve no submit', async () => {
    resolveOrgByCodigo.mockResolvedValue({ id: 'org-y', nome: 'Empresa Y' });
    renderAt('/motorista/registo');
    fireEvent.change(screen.getByLabelText(/Código da empresa/i), {
      target: { value: 'empresa-y' },
    });
    await preencherEsubmeter();
    await waitFor(() => expect(signUp).toHaveBeenCalled());
    expect(signUp.mock.calls[0][0].options.data.org_id).toBe('org-y');
  });

  it('sem código preenchido não chama signUp', async () => {
    renderAt('/motorista/registo');
    await preencherEsubmeter();
    expect(signUp).not.toHaveBeenCalled();
  });
});
