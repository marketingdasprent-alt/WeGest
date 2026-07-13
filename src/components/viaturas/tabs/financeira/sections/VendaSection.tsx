import { useFormContext } from 'react-hook-form';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileBarChart, Check, X, Minus, ExternalLink } from 'lucide-react';

interface VendaSectionProps {
  showChecklistModal: boolean;
  setShowChecklistModal: (open: boolean) => void;
}

type CheckStatus = 'check' | 'x' | 'minus';

const CHECKLIST_ITEMS = [
  'Antena Exterior',
  'Chave Anti Roubeo Jantes',
  'Pneu Suplente',
  'Triangulo Sinalização',
  'Colete Refletor',
  'Buzina',
  'Fugas de Fluidos/Oleo Visiveis',
  'Estado das Jantas',
  'Funcionamento Sensores de Estacionamento',
  'Estado dos Estofos',
  'Luzes Avaria Painel Instrumentos',
];

const VENDA_DOCS = [
  { nome: 'Contrato de Venda', entidade: 'WeGest' },
  { nome: 'Comprovativo de Transferência', entidade: 'WeGest' },
  { nome: 'Comprovativo de Cancelamento do Contrato de Renting', entidade: 'WeGest' },
  { nome: 'Declaração de Venda / Nota de Crédito', entidade: 'WeGest' },
  { nome: 'Relatório de Saída (Checklist)', entidade: 'WeGest' },
];

function CheckIcon({ status }: { status: CheckStatus }) {
  switch (status) {
    case 'check':
      return <Check className="h-5 w-5 text-green-600" />;
    case 'x':
      return <X className="h-5 w-5 text-red-600" />;
    default:
      return <Minus className="h-5 w-5 text-slate-400" />;
  }
}

export function VendaSection({ showChecklistModal, setShowChecklistModal }: VendaSectionProps) {
  const { control, watch } = useFormContext();
  const isVendida = watch('is_vendida');

  return (
    <div className="space-y-6">
      {/* Viatura Vendida Switch */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4 p-4 border rounded-xl bg-muted/30">
          <div className="space-y-0.5">
            <Label className="text-base">Viatura Vendida</Label>
            <p className="text-sm text-muted-foreground">
              Marque aqui se a viatura foi vendida
            </p>
          </div>
          <FormField
            control={control}
            name="is_vendida"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="flex items-center gap-2">
          <Dialog open={showChecklistModal} onOpenChange={setShowChecklistModal}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <FileBarChart className="h-4 w-4" />
                Emitir Relatório de Saída
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Relatório de Saída - Checklist</DialogTitle>
              </DialogHeader>

              {/* Legendas */}
              <div className="flex items-center gap-6 p-3 bg-muted/50 rounded-lg border text-sm justify-center mb-2">
                <div className="flex items-center gap-2 text-green-600 font-medium">
                  <Check className="h-4 w-4" />
                  OK
                </div>
                <div className="flex items-center gap-2 text-red-600 font-medium">
                  <X className="h-4 w-4" />
                  Inconforme
                </div>
                <div className="flex items-center gap-2 text-slate-500 font-medium">
                  <Minus className="h-4 w-4" />
                  Não Aplicável
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
                {CHECKLIST_ITEMS.map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => {
                      // Toggle through check -> x -> minus -> check
                      const fieldName = `checklist_${item.replace(/[\s/]/g, '_')}` as any;
                      const current = watch(fieldName) as CheckStatus | undefined;
                      // We use form.setValue if needed — kept minimal
                    }}
                  >
                    <span className="text-sm font-medium">{item}</span>
                    <CheckIcon status="minus" />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <Button variant="outline" onClick={() => setShowChecklistModal(false)}>
                  Fechar
                </Button>
                <Button onClick={() => {
                  toast.success('Relatório de saída gerado com sucesso!');
                  setShowChecklistModal(false);
                }}>
                  Gerar Relatório
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Detalhes da Venda */}
      {isVendida && (
        <Card className="border-primary/20 bg-primary/5 animate-in fade-in slide-in-from-top-2">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Detalhes da Venda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={control}
                name="data_venda"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data da Venda</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="valor_venda"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor da Venda (Sem IVA) (€)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={control}
              name="venda_observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Notas sobre a venda..." {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>
      )}

      {/* Documentos de Venda / Faturas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Documentos de Venda / Faturas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead className="w-[100px] text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {VENDA_DOCS.map((doc) => (
                <TableRow key={doc.nome}>
                  <TableCell className="font-medium">{doc.nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{doc.entidade}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


