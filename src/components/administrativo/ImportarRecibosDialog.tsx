import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, FileText, CheckCircle, AlertCircle, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';

interface ParsedRecibo {
  fileName: string;
  file: File;
  nome: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string;
  semanaNumero: number | null;
  uber: number;
  bolt: number;
  aluguer: number;
  combustivel: number;
  viaVerde: number;
  outrasReceitas: number;
  outrosCustos: number;
  caucao: number;
  seguros: number;
  reparacoes: number;
  valoresAnteriores: number;
  totalReceber: number;
  iva: number;
  irs: number;
  liquido: number;
  motoristaId: string | null;
  motoristaMatch: string | null;
  status: 'matched' | 'unmatched' | 'error';
  errorMsg?: string;
}

interface ImportarRecibosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  motoristas: Array<{ id: string; nome: string }>;
  onImportComplete: () => void;
}

// Parse date string "DD-MM-YYYY" to "YYYY-MM-DD"
function parseDateStr(str: string): string {
  const m = str.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return str;
}

// Parse value like "+ 461.63€" or "- 66.25€" or "490.05€" or "-208.03€"
function parseValue(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[€\s]/g, '').replace(',', '.').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// Normalize name for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNameMatch(pdfName: string, dbName: string): boolean {
  const a = normalizeName(pdfName);
  const b = normalizeName(dbName);
  if (a === b) return true;
  // First+last match
  const aParts = a.split(' ');
  const bParts = b.split(' ');
  if (aParts.length >= 2 && bParts.length >= 2) {
    const aFL = `${aParts[0]} ${aParts[aParts.length - 1]}`;
    const bFL = `${bParts[0]} ${bParts[bParts.length - 1]}`;
    if (aFL === bFL) return true;
  }
  // Contains
  if (b.includes(a) && a.length > 5) return true;
  if (a.includes(b) && b.length > 5) return true;
  // 2+ common parts
  const noise = ['da', 'de', 'do', 'das', 'dos', 'e'];
  const aFiltered = aParts.filter((p) => p.length > 2 && !noise.includes(p));
  const bFiltered = bParts.filter((p) => p.length > 2 && !noise.includes(p));
  const common = aFiltered.filter((p) => bFiltered.includes(p));
  if (common.length >= 2) return true;
  return false;
}

// Extract text from PDF using pdfjs-dist
async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

// Parse the structured text from the PDF
function parseReciboText(
  text: string,
  fileName: string
): Omit<ParsedRecibo, 'motoristaId' | 'motoristaMatch' | 'status' | 'file'> {
  const getField = (pattern: RegExp): string => {
    const m = text.match(pattern);
    return m ? m[1].trim() : '';
  };

  const getValueField = (label: string): number => {
    // Match patterns like "Uber + 461.63€" or "Aluguer - 66.25€" or "Uber  + 0€"
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped + '\\s*([+-]?)\\s*([\\d.,]+)\\s*€', 'i');
    const m = text.match(pattern);
    if (!m) return 0;
    const sign = m[1] === '-' ? -1 : 1;
    const val = parseFloat(m[2].replace(',', '.'));
    return isNaN(val) ? 0 : Math.abs(val) * sign;
  };

  const nome = getField(/Nome:\s*(.+?)(?:\s{2,}|Data:|$)/i);
  const dataStr = getField(/Data:\s*(.+?)(?:\s{2,}|Semana:|$)/i);
  const semanaStr = getField(/Semana:\s*(\d+)/i);

  // Parse date range "04-05-2026 - 10-05-2026"
  let dataInicio = '';
  let dataFim = '';
  const dateMatch = dataStr.match(/(\d{2}-\d{2}-\d{4})\s*-\s*(\d{2}-\d{2}-\d{4})/);
  if (dateMatch) {
    dataInicio = parseDateStr(dateMatch[1]);
    dataFim = parseDateStr(dateMatch[2]);
  }

  // Extract all financial values
  const uber = Math.abs(getValueField('Uber'));
  const bolt = Math.abs(getValueField('Bolt'));
  const aluguer = Math.abs(getValueField('Aluguer'));
  const combustivel = Math.abs(getValueField('Combustivel/Carregamento'));
  const viaVerde = Math.abs(getValueField('Via Verde'));
  const outrasReceitas = Math.abs(getValueField('Outras receitas'));
  const outrosCustos = Math.abs(getValueField('Outros custos'));
  const seguros = Math.abs(getValueField('Seguros'));
  const valoresAnteriores = Math.abs(getValueField('Valores a transportar semana anterior'));

  // PDF extraction pode perder acentos — tentar ambas versões
  const caucaoVal = Math.abs(getValueField('Caucao')) || Math.abs(getValueField('Caução'));
  const reparacoesVal =
    Math.abs(getValueField('Reparacoes')) || Math.abs(getValueField('Reparações'));

  // Total and Líquido
  const totalMatch = text.match(/Total a receber:\s*(-?[\d.,]+)\s*€/i);
  const totalReceber = totalMatch ? parseValue(totalMatch[1]) : 0;

  const liquidoMatch = text.match(/L[ií]quido\s*(-?[\d.,]+)\s*€/i);
  const liquido = liquidoMatch ? parseValue(liquidoMatch[1]) : totalReceber;

  const ivaMatch = text.match(/IVA\s*(\d+)/i);
  const iva = ivaMatch ? parseFloat(ivaMatch[1]) : 0;

  const irsMatch = text.match(/IRS\s*(\d+)/i);
  const irs = irsMatch ? parseFloat(irsMatch[1]) : 0;

  return {
    fileName,
    nome,
    dataInicio,
    dataFim,
    semanaNumero: semanaStr ? parseInt(semanaStr) : null,
    uber,
    bolt,
    aluguer,
    combustivel,
    viaVerde,
    outrasReceitas,
    outrosCustos,
    caucao: caucaoVal,
    seguros,
    reparacoes: reparacoesVal,
    valoresAnteriores,
    totalReceber,
    iva,
    irs,
    liquido,
  };
}

export function ImportarRecibosDialog({
  open,
  onOpenChange,
  motoristas,
  onImportComplete,
}: ImportarRecibosDialogProps) {
  const { orgId } = useTenant();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedRecibos, setParsedRecibos] = useState<ParsedRecibo[]>([]);

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setParsing(true);
    const results: ParsedRecibo[] = [];

    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        results.push({
          fileName: file.name,
          file,
          nome: '',
          dataInicio: '',
          dataFim: '',
          semanaNumero: null,
          uber: 0,
          bolt: 0,
          aluguer: 0,
          combustivel: 0,
          viaVerde: 0,
          outrasReceitas: 0,
          outrosCustos: 0,
          caucao: 0,
          seguros: 0,
          reparacoes: 0,
          valoresAnteriores: 0,
          totalReceber: 0,
          iva: 0,
          irs: 0,
          liquido: 0,
          motoristaId: null,
          motoristaMatch: null,
          status: 'error',
          errorMsg: 'Ficheiro não é PDF',
        });
        continue;
      }

      try {
        const text = await extractPdfText(file);
        const parsed = parseReciboText(text, file.name);

        // Match motorista by name
        let motoristaId: string | null = null;
        let motoristaMatch: string | null = null;

        if (parsed.nome) {
          for (const m of motoristas) {
            if (isNameMatch(parsed.nome, m.nome)) {
              motoristaId = m.id;
              motoristaMatch = m.nome;
              break;
            }
          }
        }

        results.push({
          ...parsed,
          file,
          motoristaId,
          motoristaMatch,
          status: motoristaId ? 'matched' : parsed.nome ? 'unmatched' : 'error',
          errorMsg: !parsed.nome ? 'Nome não encontrado no PDF' : undefined,
        });
      } catch (err: any) {
        results.push({
          fileName: file.name,
          file,
          nome: '',
          dataInicio: '',
          dataFim: '',
          semanaNumero: null,
          uber: 0,
          bolt: 0,
          aluguer: 0,
          combustivel: 0,
          viaVerde: 0,
          outrasReceitas: 0,
          outrosCustos: 0,
          caucao: 0,
          seguros: 0,
          reparacoes: 0,
          valoresAnteriores: 0,
          totalReceber: 0,
          iva: 0,
          irs: 0,
          liquido: 0,
          motoristaId: null,
          motoristaMatch: null,
          status: 'error',
          errorMsg: `Erro ao ler PDF: ${err.message}`,
        });
      }
    }

    setParsedRecibos(results);
    setParsing(false);

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    const toImport = parsedRecibos.filter((r) => r.status === 'matched');
    if (toImport.length === 0) {
      toast.error('Nenhum recibo com motorista identificado para importar');
      return;
    }

    setSaving(true);
    let imported = 0;
    let errors = 0;

    for (const recibo of toImport) {
      try {
        // Upload PDF to storage — normalizar nome para evitar caracteres especiais
        const safeFileName = recibo.fileName
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `recibos-importados/${orgId}/${recibo.dataInicio}/${recibo.motoristaId}_${safeFileName}`;
        const { error: uploadError } = await supabase.storage
          .from('motorista-recibos')
          .upload(filePath, recibo.file, { upsert: true });

        if (uploadError) {
          console.error('Upload error:', uploadError);
        }

        // Upsert record
        const { error: dbError } = await supabase.from('recibos_importados').upsert(
          {
            motorista_id: recibo.motoristaId,
            motorista_nome: recibo.nome,
            semana_inicio: recibo.dataInicio,
            semana_fim: recibo.dataFim,
            semana_numero: recibo.semanaNumero,
            faturado_uber: recibo.uber,
            faturado_bolt: recibo.bolt,
            aluguer: recibo.aluguer,
            combustivel: recibo.combustivel,
            via_verde: recibo.viaVerde,
            outras_receitas: recibo.outrasReceitas,
            outros_custos: recibo.outrosCustos,
            caucao: recibo.caucao,
            seguros: recibo.seguros,
            reparacoes: recibo.reparacoes,
            valores_anteriores: recibo.valoresAnteriores,
            total_receber: recibo.totalReceber,
            iva_percentagem: recibo.iva,
            irs_percentagem: recibo.irs,
            liquido: recibo.liquido,
            ficheiro_url: filePath,
            org_id: orgId,
            importado_por: user?.id,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'motorista_id,semana_inicio,org_id',
          }
        );

        if (dbError) {
          console.error('DB error:', dbError);
          errors++;
        } else {
          imported++;
        }
      } catch (err) {
        console.error('Import error:', err);
        errors++;
      }
    }

    setSaving(false);

    if (imported > 0) {
      toast.success(
        `${imported} recibo${imported !== 1 ? 's' : ''} importado${imported !== 1 ? 's' : ''} com sucesso`
      );
      onImportComplete();
      onOpenChange(false);
      setParsedRecibos([]);
    }
    if (errors > 0) {
      toast.error(`${errors} erro${errors !== 1 ? 's' : ''} na importação`);
    }
  };

  const matchedCount = parsedRecibos.filter((r) => r.status === 'matched').length;
  const unmatchedCount = parsedRecibos.filter((r) => r.status === 'unmatched').length;
  const errorCount = parsedRecibos.filter((r) => r.status === 'error').length;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

  const [sortField, setSortField] = useState<string>('nome');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const STATUS_RANK: Record<string, number> = { matched: 0, unmatched: 1, error: 2 };
  const sortedRecibos = useMemo(() => {
    const list = [...parsedRecibos];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'status') {
        va = STATUS_RANK[a.status] ?? 0;
        vb = STATUS_RANK[b.status] ?? 0;
      } else if (sortField === 'nome') {
        va = a.nome || a.fileName || '';
        vb = b.nome || b.fileName || '';
      } else if (sortField === 'motoristaMatch') {
        va = a.motoristaMatch || '';
        vb = b.motoristaMatch || '';
      } else if (sortField === 'dataInicio') {
        va = a.dataInicio || '';
        vb = b.dataInicio || '';
      } else if (sortField === 'liquido') {
        va = a.liquido ?? 0;
        vb = b.liquido ?? 0;
      } else if (sortField === 'uber') {
        va = a.uber ?? 0;
        vb = b.uber ?? 0;
      } else if (sortField === 'bolt') {
        va = a.bolt ?? 0;
        vb = b.bolt ?? 0;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [parsedRecibos, sortField, sortDir]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Recibos Semanais
          </DialogTitle>
          <DialogDescription>
            Selecione os PDFs dos relatórios semanais. O sistema extrai automaticamente o nome,
            semana e valores de cada recibo.
          </DialogDescription>
        </DialogHeader>

        {/* File picker */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing || saving}
            >
              {parsing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              {parsing ? 'A processar...' : 'Selecionar PDFs'}
            </Button>

            {parsedRecibos.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="default" className="bg-green-600">
                  {matchedCount} identificados
                </Badge>
                {unmatchedCount > 0 && (
                  <Badge variant="secondary" className="bg-yellow-600 text-white">
                    {unmatchedCount} sem match
                  </Badge>
                )}
                {errorCount > 0 && <Badge variant="destructive">{errorCount} erros</Badge>}
              </div>
            )}
          </div>

          {/* Results table */}
          {parsedRecibos.length > 0 && (
            <>
              <div className="rounded-md border max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        field="status"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Estado
                      </SortableTableHead>
                      <SortableTableHead
                        field="nome"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Nome (PDF)
                      </SortableTableHead>
                      <SortableTableHead
                        field="motoristaMatch"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Motorista (Sistema)
                      </SortableTableHead>
                      <SortableTableHead
                        field="dataInicio"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Semana
                      </SortableTableHead>
                      <SortableTableHead
                        field="liquido"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                        align="right"
                      >
                        Líquido
                      </SortableTableHead>
                      <SortableTableHead
                        field="uber"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                        align="right"
                      >
                        Uber
                      </SortableTableHead>
                      <SortableTableHead
                        field="bolt"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                        align="right"
                      >
                        Bolt
                      </SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRecibos.map((r, i) => (
                      <TableRow key={i} className={r.status === 'error' ? 'opacity-50' : ''}>
                        <TableCell>
                          {r.status === 'matched' && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                          {r.status === 'unmatched' && (
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                          )}
                          {r.status === 'error' && <X className="h-4 w-4 text-red-500" />}
                        </TableCell>
                        <TableCell className="font-medium">{r.nome || r.fileName}</TableCell>
                        <TableCell>
                          {r.motoristaMatch ? (
                            <span className="text-green-600">{r.motoristaMatch}</span>
                          ) : r.status === 'unmatched' ? (
                            <span className="text-yellow-600 text-xs">Não encontrado</span>
                          ) : (
                            <span className="text-red-600 text-xs">{r.errorMsg}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.dataInicio && r.dataFim
                            ? `${r.dataInicio.split('-').reverse().join('/')} - ${r.dataFim.split('-').reverse().join('/')}`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          <span className={r.liquido >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(r.liquido)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(r.uber)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(r.bolt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Import button */}
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {matchedCount > 0
                    ? `${matchedCount} recibo${matchedCount !== 1 ? 's' : ''} pronto${matchedCount !== 1 ? 's' : ''} para importar`
                    : 'Nenhum recibo identificado para importar'}
                  {unmatchedCount > 0 &&
                    ` • ${unmatchedCount} sem correspondência (serão ignorados)`}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setParsedRecibos([]);
                      onOpenChange(false);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleImport} disabled={saving || matchedCount === 0}>
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {saving
                      ? 'A importar...'
                      : `Importar ${matchedCount} recibo${matchedCount !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
