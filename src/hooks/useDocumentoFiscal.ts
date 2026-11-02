import { useQuery } from '@tanstack/react-query';
import { consultarDocumentoFiscal, type DocumentoFiscalConsultado } from '@/lib/faturacao';

/**
 * Total real de uma fatura no software de faturação e o que já foi creditado contra ela.
 * Só corre quando há documento fiscal; a org entra na chave para a cache não servir dados de outra org; sem staleTime porque o saldo muda a cada NC emitida.
 */
export function useDocumentoFiscal(
  documentoReferencia: string | null | undefined,
  cobrancaId: string | undefined,
  orgId: string | null | undefined,
  enabled = true
) {
  return useQuery<DocumentoFiscalConsultado, Error>({
    queryKey: ['documento-fiscal', { orgId, documentoReferencia, cobrancaId }],
    queryFn: () => consultarDocumentoFiscal(documentoReferencia as string, cobrancaId),
    enabled: enabled && !!documentoReferencia && !!orgId,
    staleTime: 0,
    retry: false,
  });
}
