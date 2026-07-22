import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { buildSupabaseFunctionUrl } from '@/utils/supabaseFunctionUrl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { validarNIF } from '@/lib/pt-validators';
import { useOrgId } from '@/contexts/TenantContext';

// ── Column name normalisation ────────────────────────────────────────────────
// Maps Excel header variations → internal key
const HEADER_MAP: Record<string, string> = {
  observações: 'observacoes',
  observacoes: 'observacoes',
  nome: 'nome',
  gestor: 'gestor',
  marca: 'marca',
  modelo: 'modelo',
  tvde: 'tvde',
  matrícula: 'matricula',
  matricula: 'matricula',
  'cartão de combustível': 'cartao_combustivel',
  'cartao de combustivel': 'cartao_combustivel',
  'data/hora inicio': 'data_inicio',
  'data/hora início': 'data_inicio',
  'data/hora saída': 'data_saida',
  'data/hora saida': 'data_saida',
  'valor viatura': 'valor_viatura',
  caução: 'caucao',
  caucao: 'caucao',
  km: 'km',
  nib: 'nib',
  móvel: 'movel',
  movel: 'movel',
  email: 'email',
  localização: 'localizacao',
  localizacao: 'localizacao',
  nif: 'nif',
};

const normaliseHeader = (h: string): string =>
  HEADER_MAP[h.toLowerCase().trim()] ?? h.toLowerCase().trim().replace(/\s+/g, '_');

interface ParsedRow {
  [key: string]: string;
}

interface ImportResultRow {
  row: number;
  nome: string;
  matricula: string;
  status: 'ok' | 'erro' | 'aviso';
  message: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Step = 'idle' | 'preview' | 'importing' | 'done';

export const ImportExcelDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const orgId = useOrgId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('idle');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [results, setResults] = useState<ImportResultRow[]>([]);
  const [summary, setSummary] = useState({ ok: 0, erros: 0, total: 0 });

  const reset = () => {
    setStep('idle');
    setFileName('');
    setParsedRows([]);
    setSheetNames([]);
    setSelectedSheet('');
    setWorkbook(null);
    setResults([]);
    setSummary({ ok: 0, erros: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const parseSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
    if (raw.length < 2) return [];

    const headers = (raw[0] as string[]).map(normaliseHeader);
    return raw
      .slice(1)
      .map((row) => {
        const obj: ParsedRow = {};
        headers.forEach((h, i) => {
          obj[h] = String(row[i] ?? '');
        });
        return obj;
      })
      .filter((r) => Object.values(r).some((v) => v.trim() !== ''));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        setWorkbook(wb);
        setSheetNames(wb.SheetNames);

        // Auto-select first sheet
        const first = wb.SheetNames[0];
        setSelectedSheet(first);
        const rows = parseSheet(wb, first);
        setParsedRows(rows);
        setStep('preview');
      } catch {
        toast.error('Erro ao ler ficheiro Excel. Verifique o formato.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSheetChange = (name: string) => {
    if (!workbook) return;
    setSelectedSheet(name);
    setParsedRows(parseSheet(workbook, name));
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;

    // Pré-validação de NIFs: bloqueia antes de enviar para o utilizador corrigir
    // o Excel — senão as linhas inválidas morrem uma a uma na BD a meio do import.
    const nifsInvalidos = parsedRows
      .map((r, i) => ({ linha: i + 2, nif: (r.nif ?? '').replace(/\s/g, '') }))
      .filter((r) => r.nif && !validarNIF(r.nif).valid);
    if (nifsInvalidos.length > 0) {
      const amostra = nifsInvalidos
        .slice(0, 5)
        .map((r) => `linha ${r.linha} (${r.nif})`)
        .join(', ');
      toast.error(
        `${nifsInvalidos.length} NIF(s) inválido(s) no ficheiro: ${amostra}` +
          `${nifsInvalidos.length > 5 ? ', …' : ''}. Corrige o Excel e volta a carregar.`
      );
      return;
    }

    // Normalização: NIFs sem espaços (consistente com os formulários).
    const rowsNormalizadas = parsedRows.map((r) =>
      r.nif ? { ...r, nif: r.nif.replace(/\s/g, '') } : r
    );

    setStep('importing');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão inválida');

      const url = buildSupabaseFunctionUrl('excel-import');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows: rowsNormalizadas, org_id: orgId }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Erro na importação');

      setResults(data.results || []);
      setSummary({ ok: data.ok, erros: data.erros, total: data.total });
      setStep('done');

      if (data.erros === 0) {
        toast.success(`${data.ok} registos importados com sucesso!`);
      } else {
        toast.warning(`${data.ok} importados, ${data.erros} com erro.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao importar');
      setStep('preview');
    }
  };

  // Preview columns to show (most relevant)
  const previewCols = ['nome', 'nif', 'matricula', 'gestor', 'valor_viatura', 'data_inicio'];
  const availableCols =
    parsedRows.length > 0 ? previewCols.filter((c) => parsedRows[0][c] !== undefined) : [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Excel
          </DialogTitle>
          <DialogDescription>
            Importa motoristas, viaturas e associações a partir do ficheiro de gestão.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* ── Step: idle ── */}
          {step === 'idle' && (
            <div
              className="border-2 border-dashed border-border rounded-lg p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Clica para selecionar o ficheiro Excel</p>
                <p className="text-sm text-muted-foreground mt-1">.xlsx ou .xls</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* ── Step: preview ── */}
          {step === 'preview' && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{fileName}</span>
                  <Badge variant="secondary">{parsedRows.length} linhas</Badge>
                </div>

                {/* Sheet selector */}
                {sheetNames.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Sheet:</span>
                    <div className="flex gap-1">
                      {sheetNames.map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={selectedSheet === s ? 'default' : 'outline'}
                          onClick={() => handleSheetChange(s)}
                          className="h-7 text-xs"
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Pré-visualização das primeiras colunas. A importação actualiza motoristas e
                  viaturas existentes (por NIF/matrícula) e cria novos registos quando necessário.
                </AlertDescription>
              </Alert>

              <ScrollArea className="flex-1 border rounded-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                          #
                        </th>
                        {availableCols.map((c) => (
                          <th
                            key={c}
                            className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground capitalize whitespace-nowrap"
                          >
                            {c.replace(/_/g, ' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 50).map((row, i) => (
                        <tr key={i} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                          {availableCols.map((c) => (
                            <td
                              key={c}
                              className="px-3 py-1.5 max-w-[180px] truncate"
                              title={row[c]}
                            >
                              {row[c] || <span className="text-muted-foreground/50">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedRows.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      +{parsedRows.length - 50} linhas não mostradas
                    </p>
                  )}
                </div>
              </ScrollArea>

              <div className="flex justify-between gap-3 pt-2">
                <Button variant="outline" onClick={reset}>
                  Cancelar
                </Button>
                <Button onClick={handleImport} className="gap-2">
                  <Upload className="h-4 w-4" />
                  Importar {parsedRows.length} registos
                </Button>
              </div>
            </>
          )}

          {/* ── Step: importing ── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="font-medium">A importar {parsedRows.length} registos...</p>
              <p className="text-sm text-muted-foreground">
                Aguarda, isto pode demorar alguns segundos.
              </p>
            </div>
          )}

          {/* ── Step: done ── */}
          {step === 'done' && (
            <>
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-semibold">{summary.ok} importados</span>
                </div>
                {summary.erros > 0 && (
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="h-5 w-5" />
                    <span className="font-semibold">{summary.erros} erros</span>
                  </div>
                )}
                <span className="text-sm text-muted-foreground ml-auto">{summary.total} total</span>
              </div>

              <ScrollArea className="flex-1 border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                        #
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                        Nome
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                        Matrícula
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                        Estado
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                        Detalhe
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.row} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-1.5 text-muted-foreground">{r.row}</td>
                        <td className="px-3 py-1.5 font-medium">{r.nome}</td>
                        <td className="px-3 py-1.5">{r.matricula}</td>
                        <td className="px-3 py-1.5">
                          {r.status === 'ok' && (
                            <Badge className="bg-green-100 text-green-700 border-green-200">
                              OK
                            </Badge>
                          )}
                          {r.status === 'erro' && <Badge variant="destructive">Erro</Badge>}
                          {r.status === 'aviso' && (
                            <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                              Aviso
                            </Badge>
                          )}
                        </td>
                        <td
                          className="px-3 py-1.5 text-xs text-muted-foreground max-w-[280px] truncate"
                          title={r.message}
                        >
                          {r.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>

              <div className="flex justify-end pt-2">
                <Button onClick={handleClose}>Fechar</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
