// Leitura do total fiscal do documento já gravado no Primavera (CabecDoc.TotalDocumento).
// Sem imports de asconnect.ts (evita ciclo): a consulta e o prazo do inserir chegam por parâmetro.

// A leitura do total corre depois do inserir e acaba sempre 3 s antes do prazo do inserir (a edge
// desiste aos 45 s): um resultado tardio vira ambíguo. Só se lê com 5 s livres.
export const TIMEOUT_LEITURA_TOTAL_MS = 5_000;
export const MINIMO_LEITURA_TOTAL_MS = 5_000;
export const MARGEM_LEITURA_TOTAL_MS = 3_000;

export type ConsultarFn = (
  tabela: string,
  opcoes: {
    colunas?: string[];
    filtros?: Array<{ field: string; operator: string; value: unknown }>;
    pageSize?: number;
    ordenarPor?: string;
    timeoutMs?: number;
  }
) => Promise<Record<string, unknown>[]>;

/** As views devolvem nomes com capitalização mista ("artigo", "Descricao"); o SQL Server não distingue. */
export function campoSemMaiusculas(
  linha: Record<string, unknown> | undefined,
  campo: string
): unknown {
  if (!linha) return undefined;
  const chave = Object.keys(linha).find((k) => k.toLowerCase() === campo.toLowerCase());
  return chave === undefined ? undefined : linha[chave];
}

/** Timeout da leitura do total após o inserir; null quando não sobra margem (total fica null). */
export function timeoutDaLeituraTotal(
  criadoEm: number | undefined,
  agora: number,
  prazoInserirMs: number
): number | null {
  if (criadoEm === undefined) return TIMEOUT_LEITURA_TOTAL_MS;
  const restante = criadoEm + prazoInserirMs - MARGEM_LEITURA_TOTAL_MS - agora;
  return restante < MINIMO_LEITURA_TOTAL_MS ? null : Math.min(TIMEOUT_LEITURA_TOTAL_MS, restante);
}

function textoParaNumero(texto: string): string {
  const t = texto.trim();
  return t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
}

/** Total do documento já gravado (CabecDoc.TotalDocumento); null se não for possível ler. */
export async function lerTotalDocumento(
  consultar: ConsultarFn,
  tipo: string,
  serie: string,
  numero: string,
  timeoutMs: number = TIMEOUT_LEITURA_TOTAL_MS
): Promise<number | null> {
  const numDoc = Number(numero);
  if (!Number.isFinite(numDoc)) {
    console.warn('[asconnect] total não lido: número do documento inválido.');
    return null;
  }
  const [doc] = await consultar('CabecDoc', {
    colunas: ['TipoDoc', 'Serie', 'NumDoc', 'TotalMerc', 'TotalIva', 'TotalDocumento'],
    // Sem Filial: nem o inserir nem a config a expõem. Com várias filiais na mesma série/número
    // o filtro podia apanhar o documento de outra (por provar no servidor real).
    filtros: [
      { field: 'TipoDoc', operator: 'Equal', value: tipo },
      { field: 'Serie', operator: 'Equal', value: serie },
      { field: 'NumDoc', operator: 'Equal', value: numDoc },
    ],
    ordenarPor: 'NumDoc',
    pageSize: 1,
    timeoutMs,
  });
  if (!doc) {
    console.warn('[asconnect] total não lido: consulta sem linha.');
    return null;
  }
  const bruto = campoSemMaiusculas(doc, 'TotalDocumento');
  if (typeof bruto !== 'number' && (typeof bruto !== 'string' || !bruto.trim())) {
    console.warn('[asconnect] total não lido: CabecDoc sem TotalDocumento.');
    return null;
  }
  // '1.234,56' (vírgula decimal, ponto de milhares) além de '123.45'.
  const total = typeof bruto === 'string' ? Number(textoParaNumero(bruto)) : bruto;
  if (!Number.isFinite(total)) {
    console.warn('[asconnect] total não lido: TotalDocumento não numérico.');
    return null;
  }
  return total;
}
