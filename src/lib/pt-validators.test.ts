import { describe, it, expect } from 'vitest';

import {
  validarNIF,
  validarIBAN,
  validarCodigoPostal,
  formatarCodigoPostal,
  validarEmail,
  validarTelefone,
  validarCartaConducao,
  validarNumeroDocumento,
} from './pt-validators';

// ──────────────────────────────────────────────────────────────
// NIF
// ──────────────────────────────────────────────────────────────
describe('validarNIF', () => {
  it('aceita NIFs com checksum válido', () => {
    // 123456789: soma ponderada 156, 156 % 11 = 2, controlo = 9
    expect(validarNIF('123456789').valid).toBe(true);
    // NIFs reais das empresas do projeto (Década Ousada / Distância Arrojada)
    expect(validarNIF('515127850').valid).toBe(true);
    expect(validarNIF('516600800').valid).toBe(true);
  });

  it('aceita NIF com espaços (normaliza antes de validar)', () => {
    expect(validarNIF('123 456 789').valid).toBe(true);
  });

  it('rejeita checksum errado', () => {
    expect(validarNIF('123456780').valid).toBe(false);
    expect(validarNIF('515127851').valid).toBe(false);
  });

  it('rejeita dígito de entidade inválido (0 e 4 não existem em PT)', () => {
    expect(validarNIF('400000000').valid).toBe(false);
    expect(validarNIF('023456789').valid).toBe(false);
  });

  it('rejeita NIFs de teste da blacklist mesmo com checksum válido', () => {
    expect(validarNIF('999999990').valid).toBe(false);
    expect(validarNIF('999999999').valid).toBe(false);
    expect(validarNIF('000000000').valid).toBe(false);
  });

  it('rejeita formatos inválidos', () => {
    expect(validarNIF('').valid).toBe(false);
    expect(validarNIF('12345678').valid).toBe(false); // 8 dígitos
    expect(validarNIF('1234567890').valid).toBe(false); // 10 dígitos
    expect(validarNIF('12345678A').valid).toBe(false); // letra
  });

  it('devolve mensagem explicativa quando inválido', () => {
    expect(validarNIF('12345678').message).toMatch(/9 dígitos/);
    expect(validarNIF('123456780').message).toMatch(/controlo/);
  });
});

// ──────────────────────────────────────────────────────────────
// IBAN
// ──────────────────────────────────────────────────────────────
describe('validarIBAN', () => {
  it('aceita IBANs válidos (mod-97 = 1)', () => {
    // IBAN de teste do Banco de Portugal
    expect(validarIBAN('PT50000201231234567890154').valid).toBe(true);
    // Exemplos clássicos internacionais (ISO 13616)
    expect(validarIBAN('DE89370400440532013000').valid).toBe(true);
    expect(validarIBAN('GB82WEST12345698765432').valid).toBe(true);
  });

  it('aceita IBAN com espaços e minúsculas (normaliza)', () => {
    expect(validarIBAN('PT50 0002 0123 1234 5678 901 54').valid).toBe(true);
    expect(validarIBAN('pt50000201231234567890154').valid).toBe(true);
  });

  it('rejeita checksum errado', () => {
    expect(validarIBAN('PT50000201231234567890155').valid).toBe(false);
    expect(validarIBAN('DE89370400440532013001').valid).toBe(false);
  });

  it('rejeita IBAN PT com comprimento errado', () => {
    const res = validarIBAN('PT5000020123123456789015'); // 24 chars
    expect(res.valid).toBe(false);
    expect(res.message).toMatch(/25 caracteres/);
  });

  it('rejeita formatos inválidos', () => {
    expect(validarIBAN('').valid).toBe(false);
    expect(validarIBAN('1234567890').valid).toBe(false); // sem código de país
    expect(validarIBAN('P150000201231234567890154').valid).toBe(false); // país com dígito
  });
});

// ──────────────────────────────────────────────────────────────
// Código Postal
// ──────────────────────────────────────────────────────────────
describe('validarCodigoPostal', () => {
  it('aceita o formato XXXX-XXX', () => {
    expect(validarCodigoPostal('1000-001').valid).toBe(true);
    expect(validarCodigoPostal('9600-224').valid).toBe(true);
    expect(validarCodigoPostal(' 4000-123 ').valid).toBe(true); // trim
  });

  it('rejeita formatos errados', () => {
    expect(validarCodigoPostal('1000001').valid).toBe(false);
    expect(validarCodigoPostal('100-001').valid).toBe(false);
    expect(validarCodigoPostal('1000-01').valid).toBe(false);
    expect(validarCodigoPostal('').valid).toBe(false);
  });
});

describe('formatarCodigoPostal', () => {
  it('insere o traço após 4 dígitos', () => {
    expect(formatarCodigoPostal('1000001')).toBe('1000-001');
    expect(formatarCodigoPostal('1000')).toBe('1000');
    expect(formatarCodigoPostal('100')).toBe('100');
  });

  it('descarta não-dígitos e limita a 7 dígitos', () => {
    expect(formatarCodigoPostal('1000-001')).toBe('1000-001');
    expect(formatarCodigoPostal('10000019999')).toBe('1000-001');
    expect(formatarCodigoPostal('abc1000def001')).toBe('1000-001');
  });
});

// ──────────────────────────────────────────────────────────────
// Email
// ──────────────────────────────────────────────────────────────
describe('validarEmail', () => {
  it('aceita emails normais', () => {
    expect(validarEmail('a@b.pt').valid).toBe(true);
    expect(validarEmail('marketing@dasprent.pt').valid).toBe(true);
    expect(validarEmail('user.name+tag@sub.dominio.com').valid).toBe(true);
  });

  it('rejeita formatos inválidos', () => {
    expect(validarEmail('').valid).toBe(false);
    expect(validarEmail('semarroba.pt').valid).toBe(false);
    expect(validarEmail('a@b').valid).toBe(false);
    expect(validarEmail('a@b.').valid).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// Telefone (E.164)
// ──────────────────────────────────────────────────────────────
describe('validarTelefone', () => {
  it('aceita números PT móveis e fixos com +351', () => {
    expect(validarTelefone('+351912345678').valid).toBe(true);
    expect(validarTelefone('+351212345678').valid).toBe(true);
    expect(validarTelefone('+351 912 345 678').valid).toBe(true); // espaços
  });

  it('rejeita números PT que não começam por 2 ou 9', () => {
    expect(validarTelefone('+351812345678').valid).toBe(false);
    expect(validarTelefone('+351112345678').valid).toBe(false);
  });

  it('aceita números internacionais genéricos (7–15 dígitos)', () => {
    expect(validarTelefone('+5511987654321').valid).toBe(true);
    expect(validarTelefone('+44 20 7946 0958').valid).toBe(true);
  });

  it('rejeita vazio e comprimentos impossíveis', () => {
    expect(validarTelefone('').valid).toBe(false);
    expect(validarTelefone('+123').valid).toBe(false); // < 7 dígitos
    expect(validarTelefone('+1234567890123456').valid).toBe(false); // > 15 dígitos
  });
});

// ──────────────────────────────────────────────────────────────
// Carta de Condução
// ──────────────────────────────────────────────────────────────
describe('validarCartaConducao', () => {
  it('aceita 6–12 alfanuméricos, ignorando espaços e hífens', () => {
    expect(validarCartaConducao('L1234567').valid).toBe(true);
    expect(validarCartaConducao('l-123 456 7').valid).toBe(true);
    expect(validarCartaConducao('123456').valid).toBe(true);
  });

  it('rejeita vazio, demasiado curto ou demasiado longo', () => {
    expect(validarCartaConducao('').valid).toBe(false);
    expect(validarCartaConducao('AB12').valid).toBe(false);
    expect(validarCartaConducao('A234567890123').valid).toBe(false); // 13 chars
  });
});

// ──────────────────────────────────────────────────────────────
// Número de Documento (por tipo)
// ──────────────────────────────────────────────────────────────
describe('validarNumeroDocumento', () => {
  it('Cartão de Cidadão: 8 dígitos, com sufixo de controlo+versão+controlo opcional', () => {
    expect(validarNumeroDocumento('cc', '12345678').valid).toBe(true);
    expect(validarNumeroDocumento('cc', '123456789ZZ4').valid).toBe(true);
    expect(validarNumeroDocumento('cc', '1234567').valid).toBe(false);
    expect(validarNumeroDocumento('cc', '12345678Z').valid).toBe(false);
    // Sem o dígito de controlo do meio (bug antigo: lia-o como parte das letras)
    expect(validarNumeroDocumento('cc', '12345678ZZ4').valid).toBe(false);
  });

  it('Cartão de Cidadão: aceita espaços, como aparece impresso no cartão físico', () => {
    expect(validarNumeroDocumento('cc', '12345678 9 ZZ 4').valid).toBe(true);
    expect(validarNumeroDocumento('cc', '32810377 2 ZZ 9').valid).toBe(true);
  });

  it('Bilhete de Identidade: exactamente 8 dígitos', () => {
    expect(validarNumeroDocumento('bi', '12345678').valid).toBe(true);
    expect(validarNumeroDocumento('bi', '12345678ZZ4').valid).toBe(false);
  });

  it('Passaporte: 1–2 letras + 6–7 dígitos', () => {
    expect(validarNumeroDocumento('passaporte', 'P1234567').valid).toBe(true);
    expect(validarNumeroDocumento('passaporte', 'AB123456').valid).toBe(true);
    expect(validarNumeroDocumento('passaporte', '1234567').valid).toBe(false);
  });

  it('AR/TR: 6–15 alfanuméricos', () => {
    expect(validarNumeroDocumento('ar', 'ABC123').valid).toBe(true);
    expect(validarNumeroDocumento('tr', 'A1B2C3D4E5').valid).toBe(true);
    expect(validarNumeroDocumento('ar', 'AB1').valid).toBe(false);
  });

  it('tipo desconhecido não chumba (evita falsos negativos)', () => {
    expect(validarNumeroDocumento('outro_tipo', 'QUALQUERCOISA1').valid).toBe(true);
  });

  it('número vazio chumba sempre', () => {
    expect(validarNumeroDocumento('cc', '').valid).toBe(false);
    expect(validarNumeroDocumento('outro_tipo', '  ').valid).toBe(false);
  });
});
