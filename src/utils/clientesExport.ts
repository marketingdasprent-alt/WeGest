// Exportação da lista de Clientes — Excel com os dados relevantes da ficha,
// incluindo a viatura do contrato activo (renting). xlsx é carregado
// dinamicamente (só quando o utilizador exporta).
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { ClienteComDocumentos, Genero } from '@/types/cliente';

const PT_DATE = (d?: string | null) => {
  if (!d) return '';
  try {
    return format(new Date(d), 'dd/MM/yyyy');
  } catch {
    return '';
  }
};

const tipoClienteLabel = (c: ClienteComDocumentos) =>
  c.tipo_cliente === 'empresa'
    ? 'Empresa'
    : c.tipo_cliente === 'condutor'
      ? 'Condutor'
      : 'Particular';

const generoLabel = (g: Genero | null) => {
  if (g === 'M') return 'Masculino';
  if (g === 'F') return 'Feminino';
  if (g === 'Outro') return 'Outro';
  return '';
};

interface ViaturaAtualInfo {
  matricula: string | null;
  marca: string | null;
  modelo: string | null;
}

// Estados operacionais considerados "em curso" — mesmo critério usado em
// ContratoEstadoActions (ESTADOS_ORIGEM_FECHO) para saber se um contrato
// ainda está activo.
const ESTADOS_CONTRATO_ATIVO = ['agendado', 'em_curso'] as const;

/** Viatura do contrato de renting activo de cada cliente — versão actual
 *  (substituido_em NULL), não eliminada, num dos estados em curso. Uma
 *  única query em bloco para toda a lista a exportar. */
async function fetchViaturasAtuais(clienteIds: string[]): Promise<Map<string, ViaturaAtualInfo>> {
  const mapa = new Map<string, ViaturaAtualInfo>();
  if (clienteIds.length === 0) return mapa;

  const { data } = await supabase
    .from('contratos_renting')
    .select('cliente_id, matricula, data_inicio, viaturas(marca, modelo)')
    .in('cliente_id', clienteIds)
    .in('estado_operacional', ESTADOS_CONTRATO_ATIVO)
    .is('substituido_em', null)
    .is('deleted_at', null)
    .order('data_inicio', { ascending: false });

  for (const row of data ?? []) {
    // Já ordenado por data_inicio desc — a 1ª ocorrência por cliente é a mais recente.
    if (mapa.has(row.cliente_id)) continue;
    const v = row.viaturas as unknown as { marca: string | null; modelo: string | null } | null;
    mapa.set(row.cliente_id, {
      matricula: row.matricula,
      marca: v?.marca ?? null,
      modelo: v?.modelo ?? null,
    });
  }
  return mapa;
}

export async function exportClientesExcel(clientes: ClienteComDocumentos[]): Promise<void> {
  const XLSX = await import('xlsx');
  const viaturasAtuais = await fetchViaturasAtuais(clientes.map((c) => c.id));

  const headers = [
    'Código',
    'Tipo',
    'Nome',
    'Nome Comercial',
    'Género',
    'NIF',
    'Email',
    'Telefone',
    'Morada',
    'Código Postal',
    'Localidade',
    'Cidade',
    'País',
    'Viatura Atual',
    'Marca/Modelo',
    'IBAN',
    'Data Nascimento',
    'Naturalidade',
    'Sede',
    'Representante',
    'Cargo Representante',
    'Licença TVDE',
    'Licença TVDE Validade',
    'Doc. Identificação Validade',
    'Carta Condução Validade',
    'Observações',
  ];

  const rows = clientes.map((c) => {
    const va = viaturasAtuais.get(c.id);
    return [
      c.codigo,
      tipoClienteLabel(c),
      c.nome,
      c.nome_comercial || '',
      c.is_empresa ? '' : generoLabel(c.genero),
      c.nif || '',
      c.email || '',
      c.telefone || '',
      c.morada || '',
      c.codigo_postal || '',
      c.localidade || '',
      c.cidade || '',
      c.pais || '',
      va?.matricula || '',
      [va?.marca, va?.modelo].filter(Boolean).join(' '),
      c.iban || '',
      PT_DATE(c.data_nascimento),
      c.naturalidade || '',
      c.sede || '',
      c.representante || '',
      c.cargo_representante || '',
      c.licenca_tvde || '',
      PT_DATE(c.licenca_validade),
      PT_DATE(c.documentoIdentificacao?.validade ?? null),
      PT_DATE(c.cartaConducao?.validade ?? null),
      c.observacoes || '',
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
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');
  XLSX.writeFile(workbook, `clientes_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}
