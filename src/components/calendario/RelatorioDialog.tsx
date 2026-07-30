import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { FileDown, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import type { CalendarioEvento } from '@/pages/Calendario';
import { TIPOS_CONFIG } from './relatorioDialog.constants';
import { exportarPDFTodos } from './relatorioPdfTodos';
import { exportarPDFGestorUnico } from './relatorioPdfGestorUnico';
import { exportarRelatorioExcel } from './relatorioExcel';
import { RelatorioFiltrosPainel } from './RelatorioFiltrosPainel';
import { RelatorioEventosPainel } from './RelatorioEventosPainel';
import { RelatorioSelectGestorDialog } from './RelatorioSelectGestorDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMonth: Date;
}

export const RelatorioDialog: React.FC<Props> = ({ open, onOpenChange, currentMonth }) => {
  const { hasPermission } = usePermissions();
  const podeVerGestores = hasPermission('calendario_ver_gestores');
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(currentMonth), 'yyyy-MM-dd'));
  const [dataFim, setDataFim] = useState(format(endOfMonth(currentMonth), 'yyyy-MM-dd'));
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null); // null = Todos
  const [gestorFiltro, setGestorFiltro] = useState<string | null>(null); // null = Todos
  const [modoData, setModoData] = useState<'evento' | 'criacao'>('evento');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportGestorLoading, setExportGestorLoading] = useState(false);
  const [exportExcelLoading, setExportExcelLoading] = useState(false);
  const [selectGestorDialogOpen, setSelectGestorDialogOpen] = useState(false);

  React.useEffect(() => {
    if (open) {
      setDataInicio(format(startOfMonth(currentMonth), 'yyyy-MM-dd'));
      setDataFim(format(endOfMonth(currentMonth), 'yyyy-MM-dd'));
      setTipoFiltro(null);
      setGestorFiltro(null);
      setModoData('evento');
    }
  }, [open, currentMonth]);

  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ['relatorio-eventos', dataInicio, dataFim, podeVerGestores, modoData],
    enabled: open && !!dataInicio && !!dataFim,
    queryFn: async () => {
      const start = new Date(dataInicio + 'T00:00:00');
      const end = new Date(dataFim + 'T23:59:59');
      const campoData = modoData === 'criacao' ? 'created_at' : 'data_inicio';

      const { data, error } = await supabase
        .from('calendario_eventos')
        .select('*')
        .gte(campoData, start.toISOString())
        .lte(campoData, end.toISOString())
        .order('data_inicio', { ascending: true });

      if (error) throw error;

      const criadorIds = [...new Set((data || []).map((e) => e.criado_por))];
      let profilesMap: Record<string, string> = {};
      if (podeVerGestores && criadorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nome')
          .in('id', criadorIds);
        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map((p) => [p.id, p.nome || '']));
        }
      }

      return (data || []).map((e) => ({
        ...e,
        profiles: profilesMap[e.criado_por] ? { nome: profilesMap[e.criado_por] } : null,
      })) as CalendarioEvento[];
    },
  });

  const eventosFiltrados = eventos.filter((ev) => {
    if (tipoFiltro && ev.tipo !== tipoFiltro) return false;
    if (gestorFiltro && ev.criado_por !== gestorFiltro) return false;
    return true;
  });

  const eventosNormais = eventosFiltrados.filter((ev) => ev.tipo !== 'slot');
  const eventosSlot = eventosFiltrados.filter((ev) => ev.tipo === 'slot');

  const exportarPDF = async () => {
    setExportLoading(true);
    try {
      await exportarPDFTodos({ eventosFiltrados, dataInicio, dataFim });
    } finally {
      setExportLoading(false);
    }
  };

  const exportarExcel = async () => {
    setExportExcelLoading(true);
    try {
      await exportarRelatorioExcel({ eventosFiltrados, dataInicio, dataFim, podeVerGestores });
    } finally {
      setExportExcelLoading(false);
    }
  };

  const exportarPDFGestorUnicoHandler = async (gestorId: string) => {
    setExportGestorLoading(true);
    try {
      await exportarPDFGestorUnico({
        gestorId,
        totalPorGestor,
        eventosFiltrados,
        dataInicio,
        dataFim,
      });
    } finally {
      setExportGestorLoading(false);
    }
  };

  // Derived data for charts
  const totalPorTipo = TIPOS_CONFIG.map((t) => ({
    ...t,
    count: eventosFiltrados.filter((ev) => ev.tipo === t.value).length,
  })).filter((t) => t.count > 0);

  const totalPorGestor = Array.from(
    new Map(eventos.map((ev) => [ev.criado_por, ev.profiles?.nome || 'Desconhecido']))
  )
    .map(([id, nome]) => ({
      id,
      nome,
      count: eventos.filter((ev) => ev.criado_por === id).length,
    }))
    .sort((a, b) => b.count - a.count);

  // Tipos que existem no período (colunas dinâmicas da matriz gestor × tipo).
  const tiposPresentes = TIPOS_CONFIG.filter((t) =>
    eventosFiltrados.some((ev) => ev.tipo === t.value)
  );

  // Matriz gestor × tipo: quantas entregas / devoluções / etc. cada gestor tem.
  const matrizGestorTipo = Array.from(
    new Map(eventosFiltrados.map((ev) => [ev.criado_por, ev.profiles?.nome || 'Desconhecido']))
  )
    .map(([id, nome]) => {
      const evs = eventosFiltrados.filter((ev) => ev.criado_por === id);
      const porTipo: Record<string, number> = {};
      for (const t of TIPOS_CONFIG) porTipo[t.value] = evs.filter((e) => e.tipo === t.value).length;
      return { id, nome, total: evs.length, porTipo };
    })
    .sort((a, b) => b.total - a.total);

  const GESTOR_PALETTE = [
    'bg-indigo-500',
    'bg-green-500',
    'bg-orange-500',
    'bg-purple-500',
    'bg-blue-500',
    'bg-yellow-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-red-500',
  ];

  const maxTipoCount = Math.max(...totalPorTipo.map((t) => t.count), 1);
  const maxGestorCount = Math.max(...totalPorGestor.map((g) => g.count), 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none p-0 flex flex-col gap-0 [&>button]:hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 border-b px-6 py-3 bg-card shrink-0">
          <div className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" />
            {/* DialogTitle e não <h2>: é este elemento que dá nome acessível ao
                diálogo. Continua a renderizar um h2 com as mesmas classes. */}
            <DialogTitle className="font-semibold text-base">Relatório de Eventos</DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={exportarPDF}
              disabled={isLoading || exportLoading || eventosFiltrados.length === 0}
              className="gap-2 h-8 text-xs"
              size="sm"
            >
              {exportLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              PDF Eventos
            </Button>
            {podeVerGestores && (
              <Button
                variant="outline"
                onClick={() => setSelectGestorDialogOpen(true)}
                disabled={isLoading || exportGestorLoading || eventosFiltrados.length === 0}
                className="gap-2 h-8 text-xs"
                size="sm"
              >
                {exportGestorLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="h-3.5 w-3.5" />
                )}
                PDF Gestor
              </Button>
            )}
            <Button
              variant="outline"
              onClick={exportarExcel}
              disabled={isLoading || exportExcelLoading || eventosFiltrados.length === 0}
              className="gap-2 h-8 text-xs border-green-600/40 text-green-700 hover:bg-green-600 hover:text-white dark:text-green-400"
              size="sm"
            >
              {exportExcelLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              )}
              Excel
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <RelatorioFiltrosPainel
            modoData={modoData}
            onModoDataChange={setModoData}
            dataInicio={dataInicio}
            onDataInicioChange={setDataInicio}
            dataFim={dataFim}
            onDataFimChange={setDataFim}
            tipoFiltro={tipoFiltro}
            onTipoFiltroChange={setTipoFiltro}
            eventos={eventos}
            podeVerGestores={podeVerGestores}
            totalPorGestor={totalPorGestor}
            gestorFiltro={gestorFiltro}
            onGestorFiltroChange={setGestorFiltro}
            totalPorTipo={totalPorTipo}
            maxTipoCount={maxTipoCount}
            GESTOR_PALETTE={GESTOR_PALETTE}
            maxGestorCount={maxGestorCount}
            eventosFiltrados={eventosFiltrados}
          />

          <RelatorioEventosPainel
            podeVerGestores={podeVerGestores}
            isLoading={isLoading}
            eventosFiltrados={eventosFiltrados}
            tiposPresentes={tiposPresentes}
            matrizGestorTipo={matrizGestorTipo}
            eventosNormais={eventosNormais}
            eventosSlot={eventosSlot}
          />
        </div>
      </DialogContent>

      {/* Dialog para selecionar gestor para PDF */}
      <RelatorioSelectGestorDialog
        open={selectGestorDialogOpen}
        onOpenChange={setSelectGestorDialogOpen}
        totalPorGestor={totalPorGestor}
        exportGestorLoading={exportGestorLoading}
        onSelectGestor={exportarPDFGestorUnicoHandler}
      />
    </Dialog>
  );
};
