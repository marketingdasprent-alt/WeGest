import { describe, it, expect } from 'vitest';
import {
  assuntoDocumento,
  emailValido,
  isMensagemDefault,
  mensagemDefaultDocumento,
  nomeFicheiroDocumento,
  tipoDocumentoLabel,
} from './documentoEmail';

describe('documentoEmail', () => {
  it('rotula os tipos de documento em PT por defeito', () => {
    expect(tipoDocumentoLabel('FT')).toBe('Fatura');
    expect(tipoDocumentoLabel('FR')).toBe('Fatura-Recibo');
    expect(tipoDocumentoLabel('NC')).toBe('Nota de Crédito');
    expect(tipoDocumentoLabel('RC')).toBe('Recibo');
  });

  it('traduz o tipo consoante o idioma', () => {
    expect(tipoDocumentoLabel('FT', 'en')).toBe('Invoice');
    expect(tipoDocumentoLabel('FT', 'es')).toBe('Factura');
  });

  it('a mensagem default PT tem o texto pedido e a assinatura DASPRENT', () => {
    const m = mensagemDefaultDocumento('pt');
    expect(m).toContain('Saudações');
    expect(m).toContain('documento referente ao seu contrato de aluguer');
    expect(m).toContain('Estamos à disposição para qualquer dúvida que surja.');
    expect(m).toContain('DASPRENT');
  });

  it('deteta mensagens default em qualquer idioma e distingue texto editado', () => {
    expect(isMensagemDefault(mensagemDefaultDocumento('pt'))).toBe(true);
    expect(isMensagemDefault(mensagemDefaultDocumento('en'))).toBe(true);
    expect(isMensagemDefault(mensagemDefaultDocumento('es'))).toBe(true);
    expect(isMensagemDefault('mensagem escrita à mão pelo gestor')).toBe(false);
  });

  it('constrói o assunto com tipo, número e contexto', () => {
    expect(
      assuntoDocumento({ tipo: 'FT', numero: '2024/123', provider_docnum: '123' }, 'Contrato #0703')
    ).toBe('Fatura 2024/123 — Contrato #0703');
  });

  it('usa provider_docnum quando não há número legal', () => {
    expect(
      assuntoDocumento({ tipo: 'RC', numero: null, provider_docnum: '55' }, 'Reserva #12')
    ).toBe('Recibo 55 — Reserva #12');
  });

  it('gera nome de ficheiro sem acentos nem carateres inválidos', () => {
    expect(nomeFicheiroDocumento({ tipo: 'FT', numero: '2024/123', provider_docnum: null })).toBe(
      'Fatura_2024-123.pdf'
    );
    expect(nomeFicheiroDocumento({ tipo: 'NC', numero: null, provider_docnum: null })).toBe(
      'Nota-de-Credito_documento.pdf'
    );
  });

  it('valida emails', () => {
    expect(emailValido('cliente@exemplo.pt')).toBe(true);
    expect(emailValido('  cliente@exemplo.pt  ')).toBe(true);
    expect(emailValido('invalido')).toBe(false);
    expect(emailValido('a@b')).toBe(false);
    expect(emailValido('')).toBe(false);
  });
});
