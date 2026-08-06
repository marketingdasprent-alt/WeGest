import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { buildSupabaseFunctionUrl } from '@/utils/supabaseFunctionUrl';
import { toast } from 'sonner';
import { useOrgId } from '@/contexts/TenantContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, FileText, CheckCircle2, AlertCircle, Fuel, Zap } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ImportRobotCsvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integracaoId: string;
  onImportComplete: () => void;
  /**
   * Separador a abrir. Quem clica em "Importar" no cartão da Bolt quer a Bolt,
   * não o Uber — abrir sempre no primeiro separador convidava a importar o
   * ficheiro certo na plataforma errada.
   */
  tabInicial?: 'uber' | 'bolt' | 'bp' | 'repsol' | 'edp';
}

export const ImportRobotCsvDialog: React.FC<ImportRobotCsvDialogProps> = ({
  open,
  onOpenChange,
  integracaoId,
  onImportComplete,
  tabInicial = 'uber',
}) => {
  const orgId = useOrgId();
  const [importing, setImporting] = useState(false);
  const [activeTab, setActiveTab] = useState(tabInicial);

  useEffect(() => {
    if (open) setActiveTab(tabInicial);
  }, [open, tabInicial]);

  // Uber files
  const [pagamentosFile, setPagamentosFile] = useState<File | null>(null);
  const [viagensFile, setViagensFile] = useState<File | null>(null);
  const pagamentosRef = useRef<HTMLInputElement>(null);
  const viagensRef = useRef<HTMLInputElement>(null);

  // BP file
  const [combustivelFile, setCombustivelFile] = useState<File | null>(null);
  const combustivelRef = useRef<HTMLInputElement>(null);

  // Repsol file
  const [repsolFile, setRepsolFile] = useState<File | null>(null);
  const repsolRef = useRef<HTMLInputElement>(null);

  // EDP file
  const [edpFile, setEdpFile] = useState<File | null>(null);
  const edpRef = useRef<HTMLInputElement>(null);

  // Bolt file
  const [boltFile, setBoltFile] = useState<File | null>(null);
  const boltRef = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleImportUber = async () => {
    if (!pagamentosFile && !viagensFile) return;

    setImporting(true);
    setResult(null);

    try {
      const body: Record<string, string> = {};
      if (pagamentosFile) body.pagamentos_csv = await pagamentosFile.text();
      if (viagensFile) body.viagens_csv = await viagensFile.text();

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Sessão inválida. Inicie sessão novamente.');

      const url = buildSupabaseFunctionUrl('robot-manual-import');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ integracao_id: integracaoId, org_id: orgId, ...body }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || `Erro ${response.status}`);

      const importResult = data.import_result || {};
      setResult({
        success: true,
        message: `Importação concluída: ${importResult.pagamentos_imported ?? 0} pagamentos, ${importResult.viagens_imported ?? 0} viagens.`,
      });
      toast.success('CSV Uber importado com sucesso');
      onImportComplete();
    } catch (error: any) {
      const msg = error.message || 'Erro ao importar CSV';
      setResult({ success: false, message: msg });
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleImportBolt = async () => {
    if (!boltFile) return;

    setImporting(true);
    setResult(null);

    try {
      const csvText = await boltFile.text();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Sessão inválida.');

      const url = buildSupabaseFunctionUrl('bolt-import-csv');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          integracao_id: integracaoId,
          dados_csv_bolt: csvText,
          origem: 'Upload Manual (Contas)',
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || `Erro ${response.status}`);

      setResult({
        success: true,
        message: `Importação Bolt concluída: ${data.imported ?? 0} registos processados.`,
      });
      toast.success('CSV Bolt importado com sucesso');
      onImportComplete();
    } catch (error: any) {
      setResult({ success: false, message: error.message });
      toast.error(error.message);
    } finally {
      setImporting(false);
    }
  };

  const handleImportFuel = async (platform: 'bp' | 'repsol' | 'edp', file: File | null) => {
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      const csvText = await file.text();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Sessão inválida.');

      const url = buildSupabaseFunctionUrl(`${platform}-import-csv`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ integracao_id: integracaoId, combustivel_csv: csvText }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || `Erro ${response.status}`);

      setResult({
        success: true,
        message: `Importação ${platform.toUpperCase()} concluída: ${data.imported ?? 0} transações, ${data.matched ?? 0} com motorista.`,
      });
      toast.success(`CSV ${platform.toUpperCase()} importado com sucesso`);
      onImportComplete();
    } catch (error: any) {
      setResult({ success: false, message: error.message });
      toast.error(error.message);
    } finally {
      setImporting(false);
    }
  };

  const handleImport = () => {
    if (activeTab === 'uber') handleImportUber();
    else if (activeTab === 'bolt') handleImportBolt();
    else if (activeTab === 'bp') handleImportFuel('bp', combustivelFile);
    else if (activeTab === 'repsol') handleImportFuel('repsol', repsolFile);
    else if (activeTab === 'edp') handleImportFuel('edp', edpFile);
  };

  const handleClose = () => {
    if (!importing) {
      setPagamentosFile(null);
      setViagensFile(null);
      setCombustivelFile(null);
      setBoltFile(null);
      setRepsolFile(null);
      setEdpFile(null);
      setResult(null);
      onOpenChange(false);
    }
  };

  const hasFiles =
    activeTab === 'uber'
      ? !!pagamentosFile || !!viagensFile
      : activeTab === 'bolt'
        ? !!boltFile
        : activeTab === 'bp'
          ? !!combustivelFile
          : activeTab === 'repsol'
            ? !!repsolFile
            : !!edpFile;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar CSV Manual
          </DialogTitle>
          <DialogDescription>Carregue ficheiros CSV para importação manual.</DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as typeof activeTab);
            setResult(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="uber">Uber</TabsTrigger>
            <TabsTrigger value="bolt">Bolt</TabsTrigger>
            <TabsTrigger value="bp">BP</TabsTrigger>
            <TabsTrigger value="repsol">Repsol</TabsTrigger>
            <TabsTrigger value="edp">EDP</TabsTrigger>
          </TabsList>

          <TabsContent value="uber" className="space-y-4 mt-4">
            <div>
              <p className="text-sm font-medium mb-1.5">CSV de Pagamentos</p>
              <div
                className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => pagamentosRef.current?.click()}
              >
                <input
                  ref={pagamentosRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => {
                    setPagamentosFile(e.target.files?.[0] ?? null);
                    setResult(null);
                  }}
                  className="hidden"
                />
                {pagamentosFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm">{pagamentosFile.name}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Clique para selecionar</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bolt" className="space-y-4 mt-4">
            <FileUploadField
              file={boltFile}
              setFile={setBoltFile}
              inputRef={boltRef}
              label="CSV Bolt (Settlements)"
              icon={<FileText className="h-4 w-4" />}
            />
          </TabsContent>

          <TabsContent value="bp" className="space-y-4 mt-4">
            <FileUploadField
              file={combustivelFile}
              setFile={setCombustivelFile}
              inputRef={combustivelRef}
              label="CSV BP (CardMonitor)"
              icon={<Fuel className="h-4 w-4" />}
            />
          </TabsContent>

          <TabsContent value="repsol" className="space-y-4 mt-4">
            <FileUploadField
              file={repsolFile}
              setFile={setRepsolFile}
              inputRef={repsolRef}
              label="CSV Repsol (Solred)"
              icon={<Fuel className="h-4 w-4" />}
            />
          </TabsContent>

          <TabsContent value="edp" className="space-y-4 mt-4">
            <FileUploadField
              file={edpFile}
              setFile={setEdpFile}
              inputRef={edpRef}
              label="CSV EDP (Mobilidade)"
              icon={<Zap className="h-4 w-4" />}
            />
          </TabsContent>
        </Tabs>

        {result && (
          <div
            className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
              result.success
                ? 'bg-green-500/10 text-green-600'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{result.message}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            Fechar
          </Button>
          {!result?.success && (
            <Button onClick={handleImport} disabled={!hasFiles || importing}>
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Importar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const FileUploadField = ({ file, setFile, inputRef, label, icon }: any) => (
  <div>
    <p className="text-sm font-medium mb-1.5">{label}</p>
    <div
      className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50"
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center justify-center gap-2">
          {icon}
          <span className="text-sm">{file.name}</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Clique para selecionar</p>
      )}
    </div>
  </div>
);
