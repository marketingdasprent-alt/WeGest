import React, { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { buildSupabaseFunctionUrl } from '@/utils/supabaseFunctionUrl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface ImportUberCsvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integracaoId: string;
  onImportComplete: () => void;
}

export const ImportUberCsvDialog: React.FC<ImportUberCsvDialogProps> = ({
  open,
  onOpenChange,
  integracaoId,
  onImportComplete,
}) => {
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setResult(null);
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setImporting(true);
    setResult(null);

    try {
      const csvText = await selectedFile.text();

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error('Sessão inválida. Inicie sessão novamente.');
      }

      // Usa uber-webhook com dados_csv_brutos — aceita utilizadores admin autenticados normalmente
      const url = buildSupabaseFunctionUrl('uber-webhook', { integracao_id: integracaoId });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          integracao_id: integracaoId,
          dados_csv_brutos: csvText,
          origem: 'Upload Manual (Integrações)',
          nome_original: selectedFile.name,
          data_extracao: new Date().toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Erro ${response.status}`);
      }

      const imported = (data.inserted ?? 0) + (data.updated ?? 0);
      setResult({
        success: true,
        message: `${imported} transacções Uber processadas com sucesso.`,
      });

      toast.success(`CSV importado: ${imported} transacções`);
      onImportComplete();
    } catch (error: any) {
      const msg = error.message || 'Erro ao importar CSV';
      setResult({ success: false, message: msg });
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (!importing) {
      setSelectedFile(null);
      setResult(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar CSV Uber
          </DialogTitle>
          <DialogDescription>
            Carregue um ficheiro CSV exportado do portal Uber Supplier para importar o histórico de
            viagens.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Input */}
          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">{selectedFile.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({(selectedFile.size / 1024).toFixed(0)} KB)
                </span>
              </div>
            ) : (
              <div>
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Clique para selecionar um ficheiro CSV
                </p>
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div
              className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                result.success
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {result.success ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <span>{result.message}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            {result?.success ? 'Fechar' : 'Cancelar'}
          </Button>
          {!result?.success && (
            <Button onClick={handleImport} disabled={!selectedFile || importing}>
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />A importar...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
