import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnviarResumosDialog } from './EnviarResumosDialog';
import type { MotoristaResumo } from './contasResumoExports';

const mutate = vi.fn();
const enviarEmail = vi.fn();
vi.mock('@/hooks/useEnvioResumos', () => ({
  useMarcarResumosEnviados: () => ({ mutate, isPending: false }),
  useEnviarResumosEmail: () => ({ mutate: enviarEmail, isPending: false }),
  useContactosMotoristas: () => ({
    isLoading: false,
    data: new Map([
      ['m1', { telefone: '912345678', email: 'ana@x.pt' }],
      ['m2', { telefone: null, email: null }],
    ]),
  }),
}));

const resumo = (id: string | undefined, nome: string, liquido: number) =>
  ({ motorista_id: id, driver_name: nome, liquido }) as MotoristaResumo;

const resumos = [
  resumo('m1', 'Ana', 300),
  resumo('m2', 'Bruno', 150),
  resumo(undefined, 'Sem ficha', 10),
];

const base = {
  open: true,
  onOpenChange: vi.fn(),
  resumos,
  weekStart: new Date(2026, 10, 2),
  weekEnd: new Date(2026, 10, 8),
  enviados: new Map(),
  formatCurrency: (v: number) => `${v} €`,
};

describe('EnviarResumosDialog', () => {
  beforeEach(() => {
    mutate.mockClear();
    enviarEmail.mockClear();
    vi.spyOn(window, 'open').mockReturnValue(null);
  });

  it('Perfil App publica de uma vez todos os motoristas com ficha', () => {
    render(<EnviarResumosDialog {...base} canal="app" />);
    fireEvent.click(screen.getByRole('button', { name: /Publicar no perfil \(2\)/ }));
    expect(mutate).toHaveBeenCalledWith(
      { motoristaIds: ['m1', 'm2'], semanaInicio: '2026-11-02', canal: 'app' },
      expect.anything()
    );
  });

  it('WhatsApp abre a conversa do número e marca só esse motorista', () => {
    render(<EnviarResumosDialog {...base} canal="whatsapp" />);
    const botoes = screen.getAllByRole('button', { name: /WhatsApp/ });
    expect(botoes[1]).toBeDisabled(); // Bruno sem telemóvel
    fireEvent.click(botoes[0]);
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/351912345678?text='),
      '_blank',
      'noopener'
    );
    expect(mutate).toHaveBeenCalledWith({
      motoristaIds: ['m1'],
      semanaInicio: '2026-11-02',
      canal: 'whatsapp',
    });
  });

  it('motorista já enviado mostra "Enviado" e o botão passa a Reenviar', () => {
    const enviados = new Map([['m1', { enviadoEm: '2026-11-09', canais: ['email' as const] }]]);
    render(<EnviarResumosDialog {...base} canal="email" enviados={enviados} />);
    expect(screen.getByText('Enviado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reenviar/ })).toBeEnabled();
  });
});

describe('EnviarResumosDialog · e-mail pelo Brevo', () => {
  beforeEach(() => {
    enviarEmail.mockClear();
    vi.spyOn(window, 'open').mockReturnValue(null);
  });

  it('"Enviar a todos" manda só quem tem e-mail e ainda não recebeu, sem abrir o Outlook', () => {
    render(<EnviarResumosDialog {...base} canal="email" />);
    fireEvent.click(screen.getByRole('button', { name: /Enviar a todos por e-mail \(1\)/ }));
    expect(enviarEmail).toHaveBeenCalledWith(
      { motoristaIds: ['m1'], semanaInicio: '2026-11-02' },
      expect.anything()
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it('o botão da linha envia esse motorista pelo Brevo', () => {
    render(<EnviarResumosDialog {...base} canal="email" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^E-mail$/ })[0]);
    expect(enviarEmail).toHaveBeenCalledWith(
      { motoristaIds: ['m1'], semanaInicio: '2026-11-02' },
      expect.anything()
    );
  });

  it('sem ninguém por enviar, não mostra "Enviar a todos"', () => {
    const enviados = new Map([['m1', { enviadoEm: '2026-11-09', canais: ['email' as const] }]]);
    render(<EnviarResumosDialog {...base} canal="email" enviados={enviados} />);
    expect(screen.queryByRole('button', { name: /Enviar a todos/ })).toBeNull();
  });
});
