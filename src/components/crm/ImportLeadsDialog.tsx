import React, { useState } from 'react';
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
import { Upload, Loader2, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface ImportLeadsDialogProps {
  onImportComplete: () => void;
}

export const ImportLeadsDialog: React.FC<ImportLeadsDialogProps> = ({ onImportComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (
      selectedFile &&
      (selectedFile.type === 'text/csv' ||
        selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        selectedFile.name.endsWith('.xlsx') ||
        selectedFile.name.endsWith('.csv'))
    ) {
      setFile(selectedFile);
    } else {
      toast({
        title: 'Erro',
        description: 'Por favor, selecione um arquivo CSV ou Excel (.xlsx) válido',
        variant: 'destructive',
      });
    }
  };

  const parseExcel = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (jsonData.length < 2) {
            reject(
              new Error(
                'Arquivo deve conter pelo menos uma linha de cabeçalho e uma linha de dados'
              )
            );
            return;
          }

          const headers = jsonData[0] as string[];
          const rows = jsonData.slice(1) as any[][];

          const processedData = rows
            .filter((row) => {
              return row.some(
                (cell) =>
                  cell !== undefined && cell !== null && cell !== '' && String(cell).trim() !== ''
              );
            })
            .map((row) => {
              const rowData: any = {};
              headers.forEach((header, index) => {
                const cellValue = row[index];
                const normalizedHeader = header.toString().toLowerCase().trim();
                rowData[normalizedHeader] =
                  cellValue !== undefined && cellValue !== null ? String(cellValue).trim() : '';
              });
              return rowData;
            });

          resolve(processedData);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Erro ao ler o arquivo'));
      reader.readAsArrayBuffer(file);
    });
  };
  const parseCSV = (csvText: string) => {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));

        const hasValidData = values.some((value) => value !== '');
        if (!hasValidData) continue;

        const row: any = {};
        headers.forEach((header, index) => {
          const normalizedHeader = header.toLowerCase().trim();
          row[normalizedHeader] = values[index] || '';
        });

        data.push(row);
      }
    }

    return data;
  };

  const handleImport = async () => {
    if (!file) {
      toast({
        title: 'Erro',
        description: 'Por favor, selecione um arquivo',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      let leadsData: any[] = [];

      if (
        file.name.endsWith('.xlsx') ||
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ) {
        // Process Excel file
        leadsData = await parseExcel(file);
      } else {
        // Process CSV file
        const text = await file.text();
        leadsData = parseCSV(text);
      }

      const processedLeads = leadsData
        .map((lead) => {
          // Mapear colunas comuns diretamente
          const finalLead = {
            nome: lead.nome || lead.name || lead.Name || lead.NOME || '',
            email: lead.email || lead.Email || lead.EMAIL || '',
            telefone: lead.telefone || lead.phone || lead.Phone || lead.TELEFONE || '',
            zona: lead.zona || lead.zone || lead.Zone || lead.ZONA || '',
            data_aluguer: lead.data_aluguer || lead.rental_date || lead['data aluguer'] || null,
            status: lead.status || lead.Status || 'novo',
            campaign_tags: [],
            observacoes: lead.observacoes || lead.notes || lead.Notes || '',
            observacoes_gestores: lead.observacoes_gestores || lead.manager_notes || '',
            tipo_viatura: lead.tipo_viatura || lead.vehicle_type || lead['tipo viatura'] || '',
            formulario_id: null,
            tem_formacao_tvde: null,
          };

          return finalLead;
        })
        .filter((lead) => {
          // Validação final: pelo menos nome OU email devem estar preenchidos
          return lead.nome.trim() !== '' || lead.email.trim() !== '';
        });

      const { error } = await supabase.from('leads_dasprent').insert(processedLeads);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: `${processedLeads.length} leads importados com sucesso`,
      });

      setIsOpen(false);
      setFile(null);
      onImportComplete();
    } catch (error) {
      console.error('Error importing leads:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao importar leads. Verifique o formato do arquivo.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="bg-green-600/20 border-green-500/50 text-green-100 hover:bg-green-600/30"
        >
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Importar Leads
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Importar Leads</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Importe leads de um arquivo CSV ou Excel (.xlsx). O arquivo deve conter as colunas
            principais.
            <br />
            <strong>Colunas suportadas:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>
                <strong>Obrigatórias:</strong> nome, email
              </li>
              <li>
                <strong>Opcionais:</strong> telefone, zona, status, data_aluguer, tipo_viatura,
                observacoes, observacoes_gestores, tem_formacao_tvde, campaign_tags
              </li>
              <li>
                <strong>Formatos:</strong> CSV (vírgula) ou Excel (.xlsx)
              </li>
            </ul>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="file" className="text-foreground">
              Arquivo CSV ou Excel (.xlsx)
            </Label>
            <Input
              id="file"
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileChange}
              className="bg-card border-border text-foreground"
            />
          </div>

          {file && <div className="text-sm text-green-400">Arquivo selecionado: {file.name}</div>}

          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleImport}
              disabled={!file || isLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                'Importar'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
