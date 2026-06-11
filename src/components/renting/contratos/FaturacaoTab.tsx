/**
 * Aba de Faturação para Contrato Renting
 * Mostra Fatura, Fatura-Recibo, Nota de Crédito
 */

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, FileText, Download, Plus, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { useInvoicesByContrato, useCreateFatura, useKeyInvoiceHealth } from '@/hooks/useKeyInvoice';
import { useClientes } from '@/hooks/useClientes';
import { useToast } from '@/hooks/use-toast';
import type { InvoiceMetadata } from '@/types/keyinvoice';
import type { ContratoRenting } from '@/types/contratoRenting';

interface FaturacaoTabProps {
  contrato: ContratoRenting;
}

export function FaturacaoTab({ contrato }: FaturacaoTabProps) {
  const { data: invoices = [], isLoading } = useInvoicesByContrato(contrato.id);
  const { data: clientes = [] } = useClientes();
  const createMutation = useCreateFatura();
  const { data: keyinvoiceOk } = useKeyInvoiceHealth();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<'FT' | 'FR' | 'NC'>('FT');

  const clienteInfo = useMemo(() => {
    return clientes.find((c) => c.id === contrato.cliente_id);
  }, [clientes, contrato.cliente_id]);

  if (!keyinvoiceOk) {
    return (
      <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <AlertCircle className="h-5 w-5 text-yellow-600" />
        <span className="text-sm text-yellow-700">
          Sistema de faturação indisponível. Tente mais tarde.
        </span>
      </div>
    );
  }

  const handleCreateFatura = async () => {
    try {
      if (!clienteInfo) {
        toast({
          title: 'Erro',
          description: 'Cliente não encontrado',
          variant: 'destructive',
        });
        return;
      }

      // Simplificado: usar dados básicos do contrato
      // Em produção, seria um form completo com itens
      await createMutation.mutateAsync({
        contrato_id: contrato.id,
        tipo: selectedTipo,
        cliente_nome: clienteInfo.nome || 'Cliente',
        cliente_nif: clienteInfo.nif || '',
        cliente_email: clienteInfo.email,
        cliente_morada: clienteInfo.morada,
        referencia_externa: `Contrato #${contrato.codigo}`,
        itens: [
          {
            descricao: `Aluguel de viatura - Contrato ${contrato.codigo}`,
            quantidade: 1,
            preco_unitario: contrato.total_final || contrato.valor_total_manual || 0,
            taxa_iva: 23,
          },
        ],
      });
      setShowCreateDialog(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao criar fatura';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    }
  };

  const tipoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      FT: 'Fatura',
      FR: 'Fatura-Recibo',
      NC: 'Nota de Crédito',
    };
    return labels[tipo] || tipo;
  };

  return (
    <div className="space-y-4">
      {/* Header com botão de criar */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Documentos de Faturação (KeyInvoice)</h3>
        <Button
          onClick={() => setShowCreateDialog(true)}
          disabled={createMutation.isPending}
          size="sm"
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Nova Fatura
        </Button>
      </div>

      {/* Lista de faturas */}
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : invoices.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <FileText className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600">Sem faturas criadas ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {invoices.map((invoice) => (
            <InvoiceCard key={invoice.id} invoice={invoice} />
          ))}
        </div>
      )}

      {/* Dialog criar fatura */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Documento</DialogTitle>
            <DialogDescription>Selecione o tipo de documento que deseja criar</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Tipo de Documento</label>
              <Select value={selectedTipo} onValueChange={(v) => setSelectedTipo(v as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FT">Fatura (FT)</SelectItem>
                  <SelectItem value="FR">Fatura-Recibo (FR)</SelectItem>
                  <SelectItem value="NC">Nota de Crédito (NC)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                disabled={createMutation.isPending}
              >
                Cancelar
              </Button>
              <Button onClick={handleCreateFatura} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvoiceCard({ invoice }: { invoice: InvoiceMetadata }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle className="text-sm">
                {invoice.keyinvoice_numero} ({invoice.keyinvoice_serie})
              </CardTitle>
              <p className="text-xs text-gray-500">
                {invoice.keyinvoice_data
                  ? format(new Date(invoice.keyinvoice_data), 'dd MMM yyyy', { locale: ptBR })
                  : '—'}
              </p>
            </div>
          </div>
          <Badge variant="outline">{invoice.tipo}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">€ {invoice.total?.toFixed(2) || '0.00'}</p>
        </div>
        {invoice.url_pdf && (
          <Button variant="ghost" size="sm" onClick={() => window.open(invoice.url_pdf, '_blank')}>
            <Download className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
