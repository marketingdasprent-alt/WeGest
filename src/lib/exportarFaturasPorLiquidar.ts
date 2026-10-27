import * as XLSX from 'xlsx';
import { formatDate } from '@/utils/formatters';
import type { ClienteComFaturas } from '@/hooks/useFaturasPorLiquidar';

/** Linhas da folha, no formato do mapa "Faturas não liquidadas / Cliente" do KeyInvoice. */
export function linhasExcelPorLiquidar(grupos: ClienteComFaturas[]) {
  const linhas = grupos.flatMap((g) => [
    ...g.faturas.map((f) => ({
      Cliente: g.clienteNome,
      Data: formatDate(f.emitidaEm),
      'Nº Doc.': f.documento_externo_ref ?? '',
      Descrição: f.descricao ?? '',
      'Valor Total': f.valorTotal,
      Liquidado: Math.round((f.pago + f.creditado) * 100) / 100,
      Pendente: f.saldoPagar,
    })),
    {
      Cliente: `Total ${g.clienteNome}`,
      Data: '',
      'Nº Doc.': '',
      Descrição: '',
      'Valor Total': null,
      Liquidado: null,
      Pendente: g.totalPendente,
    },
  ]);
  const total = grupos.reduce((s, g) => s + g.totalPendente, 0);
  linhas.push({
    Cliente: 'Total',
    Data: '',
    'Nº Doc.': '',
    Descrição: '',
    'Valor Total': null,
    Liquidado: null,
    Pendente: Math.round(total * 100) / 100,
  });
  return linhas;
}

export function exportarFaturasPorLiquidar(grupos: ClienteComFaturas[], de: string, ate: string) {
  const ws = XLSX.utils.json_to_sheet(linhasExcelPorLiquidar(grupos));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Por liquidar');
  XLSX.writeFile(wb, `faturas_por_liquidar_${de || 'inicio'}_${ate || 'hoje'}.xlsx`);
}
