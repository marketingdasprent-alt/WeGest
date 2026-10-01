export type ColunaFinanceira =
  | 'seguros'
  | 'acordos'
  | 'caucao'
  | 'bonificacao'
  | 'ajudaCusto'
  | 'outrasDevolucoes'
  | 'outrosDebitos';

const CAT_MAP: Record<string, ColunaFinanceira> = {
  seguros: 'seguros',
  acordo: 'acordos',
  caucao: 'caucao',
  bonus: 'bonificacao',
  ajuda_custo: 'ajudaCusto',
  outras_devolucoes: 'outrasDevolucoes',
};

const JA_NOUTRA_COLUNA = ['resumos'];

const DEBITO_JA_NOUTRA_COLUNA = ['renda_viatura'];

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function colunaDoMovimento(
  categoria: string | null | undefined,
  tipo: string | null | undefined
): ColunaFinanceira | undefined {
  const cat = norm(categoria);
  const credito = norm(tipo) === 'credito';
  if (JA_NOUTRA_COLUNA.includes(cat)) return undefined;
  if (!credito && DEBITO_JA_NOUTRA_COLUNA.includes(cat)) return undefined;
  const mapeada = CAT_MAP[cat];
  if (mapeada) return mapeada;
  return credito ? 'outrasDevolucoes' : 'outrosDebitos';
}
