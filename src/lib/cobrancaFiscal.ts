// "Faturas anuladas por creditar" só deve listar cobranças que têm mesmo um
// documento fiscal certificado para creditar. `emite_fatura_fiscal` só diz que a
// cobrança PRETENDE emitir: nas faturas manuais grava-se a true antes de falar
// com o fornecedor, por isso uma emissão que falhou e foi anulada ficava na
// lista a pedir uma Nota de Crédito de um documento que nunca existiu.

interface CobrancaComDocumento {
  id: string;
  documento_externo_ref: string | null;
}

interface FaturaEmitida {
  cobranca_id?: string | null;
  status?: string | null;
  tipo?: string | null;
}

export function temDocumentoFiscalCertificado(
  cobranca: CobrancaComDocumento,
  invoices: readonly FaturaEmitida[]
): boolean {
  if (cobranca.documento_externo_ref) return true;
  return invoices.some(
    (inv) =>
      inv.cobranca_id === cobranca.id &&
      inv.status === 'emitida' &&
      (inv.tipo === 'FT' || inv.tipo === 'FR')
  );
}
