import type { RefObject } from 'react';
import { Search, Printer, FileDown, ChevronDown, Download, Upload, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { STATUS_INFO, STATUS_ORDER } from './cartoesFlotaTab.types';
import { downloadTemplate } from './cartoesFlotaImport';

interface CartoesFlotaFiltrosProps {
  search: string;
  onSearchChange: (v: string) => void;
  tipoFilter: 'todos' | 'bp' | 'repsol' | 'edp';
  onTipoFilterChange: (v: 'todos' | 'bp' | 'repsol' | 'edp') => void;
  statusSel: string;
  onStatusSelChange: (v: string) => void;
  statusCounts: Record<string, number>;
  onPrint: () => void;
  onImportClick: () => void;
  onExport: () => void;
  onCreate: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function CartoesFlotaFiltros({
  search,
  onSearchChange,
  tipoFilter,
  onTipoFilterChange,
  statusSel,
  onStatusSelChange,
  statusCounts,
  onPrint,
  onImportClick,
  onExport,
  onCreate,
  fileInputRef,
  onFileChange,
}: CartoesFlotaFiltrosProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar número, detentor, titular…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 w-64"
          />
        </div>
        <Select
          value={tipoFilter}
          onValueChange={(v) => onTipoFilterChange(v as typeof tipoFilter)}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="bp">BP</SelectItem>
            <SelectItem value="repsol">Repsol</SelectItem>
            <SelectItem value="edp">EDP</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusSel} onValueChange={onStatusSelChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativos">Ativos (sem cancelados)</SelectItem>
            <SelectItem value="todos">Todos os estados</SelectItem>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_INFO[s].label} ({statusCounts[s] || 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrint}>
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <FileDown className="h-4 w-4 mr-2" />
              Dados
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImportClick}>
              <Upload className="h-4 w-4 mr-2" />
              Importar Excel
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExport}>
              <FileDown className="h-4 w-4 mr-2" />
              Exportar Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={onFileChange}
        />
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Cartão
        </Button>
      </div>
    </div>
  );
}
