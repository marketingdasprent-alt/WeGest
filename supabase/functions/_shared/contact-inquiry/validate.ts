export interface ContactInquiry {
  nome: string;
  email: string;
  empresa: string | null;
  mensagem: string;
}

export type ValidationResult =
  | { ok: true; data: ContactInquiry }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// `website` é o honeypot: campo escondido no formulário que um humano nunca
// preenche. Se vier preenchido, é um bot — rejeita em silêncio (sem dizer
// ao chamador que foi detectado, para não ensinar o bot a evitar o campo).
export function validateContactInquiry(payload: unknown): ValidationResult {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'Pedido inválido' };
  }

  const body = payload as Record<string, unknown>;

  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return { ok: false, error: 'Pedido inválido' };
  }

  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  if (nome.length < 2 || nome.length > 100) {
    return { ok: false, error: 'Nome inválido' };
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return { ok: false, error: 'Email inválido' };
  }

  const empresaRaw = typeof body.empresa === 'string' ? body.empresa.trim() : '';
  if (empresaRaw.length > 100) {
    return { ok: false, error: 'Nome de empresa demasiado longo' };
  }

  const mensagem = typeof body.mensagem === 'string' ? body.mensagem.trim() : '';
  if (mensagem.length < 10 || mensagem.length > 2000) {
    return { ok: false, error: 'Mensagem tem de ter entre 10 e 2000 caracteres' };
  }

  return {
    ok: true,
    data: { nome, email, empresa: empresaRaw || null, mensagem },
  };
}
