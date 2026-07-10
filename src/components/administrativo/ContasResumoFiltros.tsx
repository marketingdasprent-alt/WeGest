import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Search,
  Printer,
  Settings,
  FileDown,
  ChevronDown,
  Upload,
  HandCoins,
} from 'lucide-react';
import { pt } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface WeekShortcut {
  label: string;
  date: Date;
}

interface PrintSettings {
  orientacao: string;
  mostrarGestor: boolean;
  mostrarMatricula: boolean;
}

interface ContasResumoFiltrosProps {
  isMobile: boolean;
  weekStart: Date;
  weekEnd: Date;
  weekLabel: string;
  weekShortcuts: WeekShortcut[];
  selectedWeek: Date;
  isCurrentWeek: boolean;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onSelectWeek: (date: Date) => void;
  onDayClick: (day: Date | undefined) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onPrintAll: () => void;
  showPrintSettings: boolean;
  onToggleShowPrintSettings: () => void;
  printSettings: PrintSettings;
  onUpdatePrintSetting: (key: string, value: any) => void;
  onExportExcel: () => void;
  canImportar: boolean;
  onOpenImportarWizard: () => void;
  onOpenRelatorioPagamento: () => void;
  filterRecibo: 'todos' | 'verde' | 'nao_verde';
  onFilterReciboChange: (value: 'todos' | 'verde' | 'nao_verde') => void;
  filterSaldo: 'todos' | 'negativos' | 'positivos';
  onFilterSaldoChange: (value: 'todos' | 'negativos' | 'positivos') => void;
  filterGestor: string;
  onFilterGestorChange: (value: string) => void;
  gestorMap: Record<string, string>;
}

export function ContasResumoFiltros({
  isMobile,
  weekLabel,
  weekShortcuts,
  selectedWeek,
  weekStart,
  weekEnd,
  isCurrentWeek,
  onPreviousWeek,
  onNextWeek,
  onSelectWeek,
  onDayClick,
  searchTerm,
  onSearchTermChange,
  onPrintAll,
  showPrintSettings,
  onToggleShowPrintSettings,
  printSettings,
  onUpdatePrintSetting,
  onExportExcel,
  canImportar,
  onOpenImportarWizard,
  onOpenRelatorioPagamento,
  filterRecibo,
  onFilterReciboChange,
  filterSaldo,
  onFilterSaldoChange,
  filterGestor,
  onFilterGestorChange,
  gestorMap,
}: ContasResumoFiltrosProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={onPreviousWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="justify-center text-center font-normal min-w-[260px]"
              >
                <Calendar className="mr-2 h-4 w-4" />
                {weekLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
              <div className="p-3 border-b">
                <div className="flex flex-wrap gap-1.5">
                  {weekShortcuts.map((shortcut) => (
                    <Button
                      key={shortcut.label}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => onSelectWeek(shortcut.date)}
                    >
                      {shortcut.label}
                    </Button>
                  ))}
                </div>
              </div>
              <CalendarComponent
                initialFocus
                mode="single"
                defaultMonth={selectedWeek}
                selected={selectedWeek}
                onSelect={onDayClick}
                numberOfMonths={isMobile ? 1 : 2}
                locale={pt}
                weekStartsOn={1}
                className="pointer-events-auto"
                modifiers={{
                  selected: { from: weekStart, to: weekEnd },
                }}
                modifiersStyles={{
                  selected: {
                    backgroundColor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                    borderRadius: 0,
                  },
                }}
              />
              <div className="p-2 text-center text-xs text-muted-foreground border-t bg-muted/50">
                Clique num dia para selecionar a semana inteira (Seg-Dom)
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={onNextWeek} disabled={isCurrentWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar motorista..."
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 sm:ml-auto flex-shrink-0">
          <div className="relative">
            <div className="flex">
              <Button
                variant="outline"
                size="sm"
                onClick={onPrintAll}
                className="rounded-r-none border-r-0"
              >
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-l-none px-2"
                onClick={onToggleShowPrintSettings}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </div>
            {showPrintSettings && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border rounded-lg shadow-lg p-4 w-64 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Opções de impressão
                </p>
                <div className="space-y-2">
                  {[
                    { key: 'mostrarGestor', label: 'Gestor Responsável' },
                    { key: 'mostrarMatricula', label: 'Matrícula' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <Switch
                        id={`ps-${key}`}
                        checked={(printSettings as any)[key]}
                        onCheckedChange={(v) => onUpdatePrintSetting(key, v)}
                      />
                      <Label htmlFor={`ps-${key}`} className="text-sm cursor-pointer">
                        {label}
                      </Label>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1 pt-1">
                  {(['portrait', 'landscape'] as const).map((o) => (
                    <Button
                      key={o}
                      size="sm"
                      variant={printSettings.orientacao === o ? 'default' : 'outline'}
                      className="flex-1 text-xs h-7"
                      onClick={() => onUpdatePrintSetting('orientacao', o)}
                    >
                      {o === 'portrait' ? 'Vertical' : 'Horizontal'}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <FileDown className="h-4 w-4 mr-2" />
                Dados
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExportExcel}>
                <FileDown className="h-4 w-4 mr-2" />
                Exportar Excel
              </DropdownMenuItem>
              {canImportar && (
                <DropdownMenuItem onClick={onOpenImportarWizard}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar Dados
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            className="gap-2 bg-gradient-to-r from-primary to-primary/80 text-white hover:opacity-90"
            size="sm"
            onClick={onOpenRelatorioPagamento}
          >
            <HandCoins className="h-4 w-4" />
            Relatório de Pagamento
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium mr-1">Filtrar:</span>
        <button
          onClick={() => onFilterReciboChange(filterRecibo === 'verde' ? 'todos' : 'verde')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            filterRecibo === 'verde'
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-border text-muted-foreground hover:border-green-500 hover:text-green-600'
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          Recibo Verde
        </button>
        <button
          onClick={() => onFilterReciboChange(filterRecibo === 'nao_verde' ? 'todos' : 'nao_verde')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            filterRecibo === 'nao_verde'
              ? 'bg-orange-500 border-orange-500 text-white'
              : 'border-border text-muted-foreground hover:border-orange-500 hover:text-orange-500'
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          Sem Recibo Verde
        </button>
        <button
          onClick={() => onFilterSaldoChange(filterSaldo === 'negativos' ? 'todos' : 'negativos')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            filterSaldo === 'negativos'
              ? 'bg-red-500 border-red-500 text-white'
              : 'border-border text-muted-foreground hover:border-red-500 hover:text-red-500'
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          Líquido Negativo
        </button>
        {Object.keys(gestorMap).length > 0 && (
          <Select value={filterGestor} onValueChange={onFilterGestorChange}>
            <SelectTrigger className="h-7 text-xs w-auto min-w-[140px] border-border">
              <SelectValue placeholder="Gestor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os gestores</SelectItem>
              {[...new Set(Object.values(gestorMap))].sort().map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(filterRecibo !== 'todos' || filterSaldo !== 'todos' || filterGestor !== 'todos') && (
          <button
            onClick={() => {
              onFilterReciboChange('todos');
              onFilterSaldoChange('todos');
              onFilterGestorChange('todos');
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
          >
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
