// Exportação da lista de Motoristas — Excel com os dados relevantes da ficha,
// incluindo a viatura actualmente associada (motorista_viaturas activa).
// xlsx é carregado dinamicamente (só quando o utilizador exporta).
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { Motorista } from '@/types/motorista';

const PT_DATE = (d?: string | null) => {
  if (!d) return '';
  try {
    return format(new Date(d), 'dd/MM/yyyy');
  } catch {
    return '';
  }
};

const simNao = (v?: boolean | null) => (v ? 'Sim' : 'Não');

interface ViaturaAtualInfo {
  matricula: string | null;
  marca: string | null;
  modelo: string | null;
}

/** Viatura actualmente associada a cada motorista (motorista_viaturas com
 *  status='ativo' e sem data_fim) — mesma regra usada em MotoristaDetalhe,
 *  aqui numa única query em bloco (não N+1) para toda a lista a exportar. */
async function fetchViaturasAtuais(motoristaIds: string[]): Promise<Map<string, ViaturaAtualInfo>> {
  const mapa = new Map<string, ViaturaAtualInfo>();
  if (motoristaIds.length === 0) return mapa;

  const { data } = await supabase
    .from('motorista_viaturas')
    .select('motorista_id, data_inicio, viaturas(matricula, marca, modelo)')
    .in('motorista_id', motoristaIds)
    .eq('status', 'ativo')
    .is('data_fim', null)
    .order('data_inicio', { ascending: false });

  for (const row of data ?? []) {
    // Já ordenado por data_inicio desc — a 1ª ocorrência por motorista é a mais recente.
    if (mapa.has(row.motorista_id)) continue;
    const v = row.viaturas as unknown as ViaturaAtualInfo | null;
    if (v) mapa.set(row.motorista_id, v);
  }
  return mapa;
}

export async function exportMotoristasExcel(motoristas: Motorista[]): Promise<void> {
  const XLSX = await import('xlsx');
  const viaturasAtuais = await fetchViaturasAtuais(motoristas.map((m) => m.id));

  const headers = [
    'Código',
    'Nome',
    'Estado',
    'NIF',
    'Email',
    'Telefone',
    'Morada',
    'Código Postal',
    'Cidade',
    'Gestor Responsável',
    'Data Contratação',
    'Recibo Verde',
    'Viatura Atual',
    'Marca/Modelo',
    'IBAN',
    'Cartão Frota',
    'Cartão BP',
    'Cartão Repsol',
    'Cartão EDP',
    'Caução',
    'ID Bolt',
    'ID Uber',
    'Slot',
    'Documento Tipo',
    'Documento Número',
    'Documento Validade',
    'Carta Condução',
    'Carta Validade',
    'Licença TVDE',
    'Licença TVDE Validade',
    'Observações',
  ];

  const rows = motoristas.map((m) => {
    const va = viaturasAtuais.get(m.id);
    return [
      m.codigo,
      m.nome,
      m.status_ativo ? 'Ativo' : 'Inativo',
      m.nif || '',
      m.email || '',
      m.telefone || '',
      m.morada || '',
      m.codigo_postal || '',
      m.cidade || '',
      m.gestor_responsavel || '',
      PT_DATE(m.data_contratacao),
      simNao(m.recibo_verde),
      va?.matricula || '',
      [va?.marca, va?.modelo].filter(Boolean).join(' '),
      m.iban || '',
      m.cartao_frota || '',
      m.cartao_bp || '',
      m.cartao_repsol || '',
      m.cartao_edp || '',
      m.caucao_valor ?? '',
      m.bolt_id || '',
      m.uber_uuid || '',
      simNao(m.is_slot),
      m.documento_tipo || '',
      m.documento_numero || '',
      PT_DATE(m.documento_validade),
      m.carta_conducao || '',
      PT_DATE(m.carta_validade),
      m.licenca_tvde_numero || '',
      PT_DATE(m.licenca_tvde_validade),
      m.observacoes || '',
    ];
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet['!cols'] = headers.map(() => ({ wch: 16 }));

  const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true } };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Motoristas');
  XLSX.writeFile(workbook, `motoristas_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}
