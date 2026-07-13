/** Validadores para documentos e dados portugueses */

// ── NIF ──────────────────────────────────────────────────────────────────────

/**
 * NIFs fictícios/de teste que passam o checksum mas não são atribuíveis.
 * Fontes: AT (Autoridade Tributária), VIES, testes de software PT.
 */
const NIF_BLACKLIST = new Set([
  '999999990', // NIF de teste oficial AT — matematicamente válido mas fictício
  '999999999', // variante de teste comum
  '000000000', // NIF nulo
]);

/**
 * Valida o NIF português:
 *   1. Formato: exatamente 9 dígitos
 *   2. Dígito de entidade válido: 1,2,3,5,6,7,8,9
 *   3. Checksum oficial AT (pesos 9→2, módulo 11)
 *   4. Blacklist de NIFs fictícios/de teste que passam o checksum
 */
export function validarNIF(nif: string): { valid: boolean; message?: string } {
  const n = nif.replace(/\s/g, '');

  if (!/^\d{9}$/.test(n)) {
    return { valid: false, message: 'O NIF deve ter exatamente 9 dígitos' };
  }

  // Dígitos de entidade válidos (4 = não existe em PT, 0 = reservado)
  const validStarts = [1, 2, 3, 5, 6, 7, 8, 9];
  if (!validStarts.includes(Number(n[0]))) {
    return { valid: false, message: 'O NIF não é válido' };
  }

  // Blacklist — NIFs fictícios que passam o checksum
  if (NIF_BLACKLIST.has(n)) {
    return { valid: false, message: 'Este NIF é um número de teste e não é aceite' };
  }

  // Checksum: Σ(dígito[i] × peso[i]) para i=0..7, pesos=[9,8,7,6,5,4,3,2]
  // Resto = soma % 11; dígito de controlo = resto < 2 ? 0 : 11 - resto
  const weights = [9, 8, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(n[i]), 0);
  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? 0 : 11 - remainder;

  if (checkDigit !== Number(n[8])) {
    return { valid: false, message: 'O NIF não é válido (dígito de controlo incorreto)' };
  }

  return { valid: true };
}

// ── Código Postal ─────────────────────────────────────────────────────────────

/** Valida o formato do Código Postal português: XXXX-XXX */
export function validarCodigoPostal(cp: string): { valid: boolean; message?: string } {
  if (!/^\d{4}-\d{3}$/.test(cp.trim())) {
    return { valid: false, message: 'Formato inválido — deve ser XXXX-XXX (ex: 1000-001)' };
  }
  return { valid: true };
}

/** Auto-formata o input do Código Postal inserindo o traço após 4 dígitos */
export function formatarCodigoPostal(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 7);
  if (digits.length > 4) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return digits;
}

// ── Número de Documento ───────────────────────────────────────────────────────

const DOC_RULES: Record<string, { regex: RegExp; hint: string }> = {
  cc: {
    regex: /^\d{8}(\d[A-Z]{2}\d)?$/,
    hint: '8 dígitos + 1 dígito de controlo + 2 letras + 1 dígito de controlo (ex: 123456789ZZ4)',
  },
  bi: {
    regex: /^\d{8}$/,
    hint: 'Exatamente 8 dígitos',
  },
  passaporte: {
    regex: /^[A-Z]{1,2}\d{6,7}$/i,
    hint: '1-2 letras seguidas de 6-7 dígitos (ex: P1234567)',
  },
  ar: {
    regex: /^[A-Z0-9]{6,15}$/i,
    hint: '6 a 15 caracteres alfanuméricos',
  },
  tr: {
    regex: /^[A-Z0-9]{6,15}$/i,
    hint: '6 a 15 caracteres alfanuméricos',
  },
};

// ── Email ─────────────────────────────────────────────────────────────────────

/** Valida o formato de um endereço de email. */
export function validarEmail(email: string): { valid: boolean; message?: string } {
  const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!re.test(email.trim())) {
    return { valid: false, message: 'Endereço de email inválido' };
  }
  return { valid: true };
}

// ── Telefone ──────────────────────────────────────────────────────────────────

/**
 * Valida um número de telefone em formato E.164 (como gerado pelo PhoneInput).
 * - Formato geral: + seguido de 7 a 15 dígitos
 * - Números PT (+351): 9 dígitos após o indicativo, com início em 2 (fixo) ou 9 (móvel)
 */
export function validarTelefone(tel: string): { valid: boolean; message?: string } {
  const clean = tel.replace(/[\s\-\(\)]/g, '');
  if (!clean) return { valid: false, message: 'Telefone é obrigatório' };

  const withoutPlus = clean.replace(/^\+/, '');
  if (!/^\d{7,15}$/.test(withoutPlus)) {
    return { valid: false, message: 'Número de telefone inválido' };
  }

  if (clean.startsWith('+351')) {
    const ptNum = clean.slice(4);
    if (!/^[29]\d{8}$/.test(ptNum)) {
      return {
        valid: false,
        message: 'Número português inválido — deve começar por 2 (fixo) ou 9 (móvel)',
      };
    }
  }

  return { valid: true };
}

// ── Carta de Condução ─────────────────────────────────────────────────────────

/**
 * Valida o número da carta de condução portuguesa.
 * Formato aceite: 6 a 12 caracteres alfanuméricos (letras e dígitos), ignorando
 * espaços e hífens decorativos.
 */
export function validarCartaConducao(numero: string): { valid: boolean; message?: string } {
  const clean = numero
    .trim()
    .toUpperCase()
    .replace(/[\s\-]/g, '');
  if (!clean) return { valid: false, message: 'Número da carta de condução é obrigatório' };
  if (!/^[A-Z0-9]{6,12}$/.test(clean)) {
    return {
      valid: false,
      message: 'Formato inválido — deve ter entre 6 e 12 caracteres alfanuméricos',
    };
  }
  return { valid: true };
}

// ── IBAN ──────────────────────────────────────────────────────────────────────

/**
 * Valida um IBAN português (ou genérico europeu):
 *   1. Remove espaços e converte para maiúsculas
 *   2. Para IBANs PT: deve ter exatamente 25 caracteres (PT + 23 dígitos)
 *   3. Checksum ISO 13616: mover primeiros 4 chars para o fim, substituir letras
 *      por dígitos (A=10 … Z=35), calcular mod 97 — deve ser 1
 */
export function validarIBAN(iban: string): { valid: boolean; message?: string } {
  const clean = iban.replace(/\s+/g, '').toUpperCase();

  if (!clean) return { valid: false, message: 'O IBAN é obrigatório' };

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(clean)) {
    return { valid: false, message: 'Formato de IBAN inválido' };
  }

  if (clean.startsWith('PT') && clean.length !== 25) {
    return {
      valid: false,
      message: `IBAN português deve ter 25 caracteres (tem ${clean.length})`,
    };
  }

  // Mover os primeiros 4 caracteres para o fim e converter letras em números
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const numeric = rearranged
    .split('')
    .map((c) => (c >= 'A' ? (c.charCodeAt(0) - 55).toString() : c))
    .join('');

  // Calcular mod 97 em blocos (o número é demasiado grande para Number)
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }

  if (remainder !== 1) {
    return { valid: false, message: 'IBAN inválido (dígitos de controlo incorretos)' };
  }

  return { valid: true };
}

/**
 * Valida o número de documento conforme o tipo selecionado.
 * Retorna valid:true se o tipo não for reconhecido (evita falsos negativos).
 */
export function validarNumeroDocumento(
  tipo: string,
  numero: string
): { valid: boolean; message?: string } {
  if (!numero.trim()) return { valid: false, message: 'Número do documento é obrigatório' };
  const rule = DOC_RULES[tipo?.toLowerCase()];
  if (!rule) return { valid: true };
  // Remove espaços internos — o CC costuma escrever-se em blocos
  // ("12345678 9 ZZ 4") tal como aparece impresso no cartão físico.
  const clean = numero.replace(/\s/g, '').toUpperCase();
  if (!rule.regex.test(clean)) {
    return { valid: false, message: `Formato inválido — ${rule.hint}` };
  }
  return { valid: true };
}
