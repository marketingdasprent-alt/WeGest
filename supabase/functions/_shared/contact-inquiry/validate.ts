export interface ContactInquiry {
  nome: string;
  email: string;
  empresa: string | null;
  /**
   * Opcional desde o redesenho da landing: exigir prosa para levantar a mão
   * custava-nos leads. Ver docs/superpowers/specs/2026-07-30-landing-transformacao-design.md
   */
  mensagem: string | null;
  /** Faixa de tamanho da frota — campo de qualificação, escolhido de uma lista. */
  viaturas: string | null;
}

export type ValidationResult = { ok: true; data: ContactInquiry } | { ok: false; error: string };

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

  // Mensagem opcional: vazia é um pedido de contacto válido. O limite máximo
  // fica — é a defesa contra payloads abusivos, que a mínima nunca foi.
  const mensagem = typeof body.mensagem === 'string' ? body.mensagem.trim() : '';
  if (mensagem.length > 2000) {
    return { ok: false, error: 'Mensagem não pode ter mais de 2000 caracteres' };
  }

  const viaturas = typeof body.viaturas === 'string' ? body.viaturas.trim() : '';
  if (viaturas.length > 50) {
    return { ok: false, error: 'Campo de viaturas inválido' };
  }

  return {
    ok: true,
    data: {
      nome,
      email,
      empresa: empresaRaw || null,
      mensagem: mensagem || null,
      viaturas: viaturas || null,
    },
  };
}
