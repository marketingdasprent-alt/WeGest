import { useMemo, useState } from 'react';
// xlsx carregado dinamicamente em parseExcelFile (só quando o utilizador
// importa) — fora do bundle da página Viaturas.
import { FileSpreadsheet, Loader2, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImportViaturasDialogProps {
  onImportComplete: () => void;
}

interface ImportSummary {
  totalRows: number;
  validRows: number;
  created: number;
  updated: number;
  ownerCreates: number;
  skipped: number;
  errors: number;
  warnings: string[];
}

export function ImportViaturasDialog({ onImportComplete }: ImportViaturasDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [importing, setImporting] = useState(false);

  const warningPreview = useMemo(() => summary?.warnings?.slice(0, 6) || [], [summary]);

  const resetState = () => {
    setFile(null);
    setRows(null);
    setSummary(null);
    setAnalysing(false);
    setImporting(false);
  };

  const parseExcelFile = async (selectedFile: File) => {
    const XLSX = await import('xlsx');
    const buffer = await selectedFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
      defval: '',
      raw: false,
    });
  };

  const ensureRows = async () => {
    if (!file) {
      throw new Error('Selecione primeiro um ficheiro Excel.');
    }

    if (rows) {
      return rows;
    }

    const parsedRows = await parseExcelFile(file);
    setRows(parsedRows);
    return parsedRows;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;

    if (!selectedFile) {
      resetState();
      return;
    }

    const isExcel = selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls');
    if (!isExcel) {
      toast.error('Selecione um ficheiro Excel válido (.xlsx ou .xls).');
      return;
    }

    setFile(selectedFile);
    setRows(null);
    setSummary(null);
  };

  const handleAnalyse = async () => {
    try {
      setAnalysing(true);
      const parsedRows = await ensureRows();
      const { data, error } = await supabase.functions.invoke('import-viaturas', {
        body: {
          rows: parsedRows,
          dryRun: true,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSummary(data.summary);
      toast.success('Pré-análise concluída.');
    } catch (error: any) {
      console.error('Erro ao analisar ficheiro de viaturas:', error);
      toast.error(error.message || 'Não foi possível analisar o ficheiro.');
    } finally {
      setAnalysing(false);
    }
  };

  const handleImport = async () => {
    try {
      setImporting(true);
      const parsedRows = await ensureRows();
      const { data, error } = await supabase.functions.invoke('import-viaturas', {
        body: {
          rows: parsedRows,
          dryRun: false,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSummary(data.summary);
      toast.success(
        `Importação concluída: ${data.summary.created} criadas, ${data.summary.updated} atualizadas.`
      );
      onImportComplete();
      setOpen(false);
      resetState();
    } catch (error: any) {
      console.error('Erro ao importar viaturas:', error);
      toast.error(error.message || 'Não foi possível importar as viaturas.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Importar Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar viaturas</DialogTitle>
          <DialogDescription>
            Faz match por matrícula, atualiza as existentes e cria as novas, incluindo proprietário
            e data de venda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="viaturas-file">Ficheiro Excel</Label>
            <Input id="viaturas-file" type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
            {file && (
              <p className="text-sm text-muted-foreground">
                Ficheiro selecionado:{' '}
                <span className="font-medium text-foreground">{file.name}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={analysing || importing}
            >
              Fechar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleAnalyse}
              disabled={!file || analysing || importing}
            >
              {analysing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Analisar ficheiro
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={!file || !summary || analysing || importing}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Importar viaturas
            </Button>
          </div>

          {summary && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Linhas lidas</p>
                    <p className="text-2xl font-semibold">{summary.totalRows}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Criar</p>
                    <p className="text-2xl font-semibold">{summary.created}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Atualizar</p>
                    <p className="text-2xl font-semibold">{summary.updated}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Proprietários novos</p>
                    <p className="text-2xl font-semibold">{summary.ownerCreates}</p>
                  </CardContent>
                </Card>
              </div>

              {(summary.skipped > 0 || summary.errors > 0 || warningPreview.length > 0) && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Há linhas para rever</AlertTitle>
                  <AlertDescription>
                    <div className="space-y-2">
                      <p>
                        Ignoradas: <strong>{summary.skipped}</strong> · Erros:{' '}
                        <strong>{summary.errors}</strong>
                      </p>
                      {warningPreview.length > 0 && (
                        <ul className="list-disc pl-5 space-y-1">
                          {warningPreview.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
