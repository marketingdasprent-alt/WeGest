import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { formatMatricula } from './EventoCard';
import type { CalendarioEvento } from '@/pages/Calendario';
import { TIPO_LABELS } from './relatorioDialog.constants';

export async function exportarRelatorioExcel(params: {
  eventosFiltrados: CalendarioEvento[];
  dataInicio: string;
  dataFim: string;
  podeVerGestores: boolean;
}): Promise<void> {
  const { eventosFiltrados, dataInicio, dataFim, podeVerGestores } = params;
  const XLSX = await import('xlsx');
  const headers = [
    'Data',
    'Hora',
    'Tipo',
    'Matrícula',
    'Matrícula Devolver',
    'Cidade',
    ...(podeVerGestores ? ['Responsável'] : []),
    'Observações',
  ];

  const rows = eventosFiltrados.map((ev) => {
    const dt = new Date(ev.data_inicio);
    return [
      format(dt, 'dd/MM/yyyy', { locale: pt }),
      ev.dia_todo ? 'Dia inteiro' : format(dt, 'HH:mm', { locale: pt }),
      TIPO_LABELS[ev.tipo] || ev.tipo,
      formatMatricula(ev.titulo),
      ev.matricula_devolver ? formatMatricula(ev.matricula_devolver) : '',
      ev.cidade || '',
      ...(podeVerGestores ? [ev.profiles?.nome || ''] : []),
      ev.descricao || '',
    ];
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  worksheet['!cols'] = [
    { wch: 12 }, // Data
    { wch: 12 }, // Hora
    { wch: 14 }, // Tipo
    { wch: 14 }, // Matrícula
    { wch: 18 }, // Matrícula Devolver
    { wch: 20 }, // Cidade
    ...(podeVerGestores ? [{ wch: 22 }] : []), // Responsável
    { wch: 60 }, // Observações
  ];

  const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    const cell = worksheet[cellRef];
    if (cell) {
      cell.s = { font: { bold: true } };
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Eventos');

  const periodoNome = `${format(new Date(dataInicio + 'T00:00:00'), 'dd-MM-yyyy')}_${format(new Date(dataFim + 'T00:00:00'), 'dd-MM-yyyy')}`;
  XLSX.writeFile(workbook, `calendario_${periodoNome}.xlsx`);
}
