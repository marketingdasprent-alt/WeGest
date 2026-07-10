import * as XLSX from 'xlsx';

export type TipoCartao = 'bp' | 'repsol' | 'edp';

export interface ImportRow {
  _row: number;
  tipo: TipoCartao | '';
  numero: string;
  ambito: string;
  limite: string;
  pin: string;
  data_validade: string;
  detentor: string;
  notas: string;
  devolucao: string;
  erros: string[];
}

export const VALID_TIPOS: TipoCartao[] = ['bp', 'repsol', 'edp'];

/** Lê um ficheiro .xlsx/.xls (ArrayBuffer) para um WorkBook — wrapper fino
 *  sobre XLSX.read para o orquestrador não precisar de importar 'xlsx'. */
export function readWorkbook(data: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(data, { type: 'array', cellDates: false });
}

export function parseTipo(raw: unknown): TipoCartao | '' {
  const s = String(raw || '')
    .toLowerCase()
    .trim();
  if (VALID_TIPOS.includes(s as TipoCartao)) return s as TipoCartao;
  return '';
}

export function parseExcelDate(raw: unknown): string {
  if (!raw) return '';
  // Excel serial number
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

export function colKey(header: string) {
  return header.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, '_');
}

export const COL_MAP: Record<string, keyof Omit<ImportRow, '_row' | 'erros'>> = {
  tipo: 'tipo',
  type: 'tipo',
  numero: 'numero',
  number: 'numero',
  num: 'numero',
  card: 'numero',
  cartao: 'numero',
  cartão: 'numero',
  ambito: 'ambito',
  âmbito: 'ambito',
  ambience: 'ambito',
  scope: 'ambito',
  limite: 'limite',
  limit: 'limite',
  budget: 'limite',
  orcamento: 'limite',
  orçamento: 'limite',
  pin: 'pin',
  validade: 'data_validade',
  data_validade: 'data_validade',
  expiry: 'data_validade',
  expiracao: 'data_validade',
  expiração: 'data_validade',
  validity: 'data_validade',
  notas: 'notas',
  notes: 'notas',
  observacoes: 'notas',
  observações: 'notas',
  detentor: 'detentor',
  'detentor do cartao': 'detentor',
  'detentor do cartão': 'detentor',
  titular: 'detentor',
  holder: 'detentor',
  devolucao: 'devolucao',
  devolução: 'devolucao',
  return: 'devolucao',
  devolvido: 'devolucao',
};

export function parseSheet(wb: XLSX.WorkBook): ImportRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  if (raw.length < 2) return [];

  const headers = (raw[0] as unknown[]).map((h) => colKey(String(h)));
  const fieldMap: Record<number, keyof Omit<ImportRow, '_row' | 'erros'>> = {};
  headers.forEach((h, i) => {
    if (COL_MAP[h]) fieldMap[i] = COL_MAP[h];
  });

  return raw
    .slice(1)
    .map((row, idx) => {
      const r: ImportRow = {
        _row: idx + 2,
        tipo: '',
        numero: '',
        ambito: '',
        limite: '',
        pin: '',
        data_validade: '',
        detentor: '',
        notas: '',
        devolucao: '',
        erros: [],
      };
      (row as unknown[]).forEach((cell, i) => {
        const field = fieldMap[i];
        if (!field) return;
        if (field === 'tipo') {
          r.tipo = parseTipo(cell);
        } else if (field === 'data_validade') {
          r.data_validade = parseExcelDate(cell);
        } else {
          (r as any)[field] = String(cell || '').trim();
        }
      });
      // Validate
      if (!r.numero) r.erros.push('Número em falta');
      if (!r.tipo) r.erros.push(`Tipo inválido (use bp/repsol/edp)`);
      if (r.limite && isNaN(Number(r.limite))) r.erros.push('Limite inválido');
      return r;
    })
    .filter((r) => r.numero || r.tipo); // skip empty rows
}

export function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    [
      'Tipo',
      'Numero',
      'Ambito',
      'Limite',
      'PIN',
      'Validade',
      'Detentor do Cartão',
      'Notas',
      'Devolução',
    ],
    ['bp', '1234567890', 'Nacional', '200', '1234', '31/12/2026', 'DISTÂNCIA 01', '', ''],
    ['repsol', '9876543210', 'Nacional', '', '', '', 'DISTÂNCIA 02', '', ''],
    [
      'edp',
      '5551234567',
      'Nacional',
      '150',
      '',
      '30/06/2027',
      'DISTÂNCIA 03',
      'Carreg. rápido',
      '',
    ],
  ]);
  ws['!cols'] = [8, 14, 12, 8, 6, 12, 20, 20, 20].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cartões');
  XLSX.writeFile(wb, 'template_cartoes_frota.xlsx');
}
