import { useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SlotPeriodo } from '../../MotoristaResumoDialog';

interface EmailResumoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName: string;
  defaultEmail: string | null;
  dateRange: { from: Date; to: Date };
  liquido: number;
  fmt: (value: number) => string;
  receitas: { bolt: number; uber: number; outras_receitas: number };
  despesas: Record<string, number>;
  totalDespesas: number;
  isImportado: boolean;
  totalReceitas: number;
  receitaAjustada: number;
  slotPeriodos: SlotPeriodo[];
  totalSlot: number;
}

export function EmailResumoDialog({
  open,
  onOpenChange,
  driverName,
  defaultEmail,
  dateRange,
  liquido,
  fmt,
  receitas,
  despesas,
  totalDespesas,
  isImportado,
  totalReceitas,
  receitaAjustada,
  slotPeriodos,
  totalSlot,
}: EmailResumoDialogProps) {
  const [emailTo, setEmailTo] = useState(defaultEmail || '');
  const [emailCC, setEmailCC] = useState('');

  const handleSendEmail = () => {
    const subject = `Resumo Financeiro - ${driverName} - ${format(dateRange.from, 'dd/MM/yyyy', { locale: pt })}`;

    const slotEmailDetalhe =
      slotPeriodos.length > 0
        ? '\nAluguer Slot:\n' +
          slotPeriodos
            .map(
              (p) =>
                `  ${p.matricula} (${p.dataInicioStr}–${p.dataFimStr}): ${p.dias} dias × ${fmt(p.taxaDiaria)}/dia = ${fmt(p.custo)}`
            )
            .join('\n') +
          (slotPeriodos.length > 1 ? `\n  Total Slot: ${fmt(totalSlot)}` : '') +
          '\n'
        : '';

    const body =
      `Olá ${driverName},\n\nSegue o resumo financeiro do período ${format(dateRange.from, 'dd/MM/yyyy')} a ${format(dateRange.to, 'dd/MM/yyyy')}:\n\n` +
      `Receitas: ${fmt(isImportado ? totalReceitas : receitaAjustada)}\nDespesas: ${fmt(totalDespesas)}\n${slotEmailDetalhe}Líquido a Receber: ${fmt(liquido)}\n\nCumprimentos,\nEquipa WeGest`;

    const cc = emailCC.trim() ? `&cc=${encodeURIComponent(emailCC.trim())}` : '';
    window.open(
      `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(subject)}${cc}&body=${encodeURIComponent(body)}`
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-500" />
            Enviar Resumo por Email
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="email-to">Para</Label>
            <Input
              id="email-to"
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="email@motorista.pt"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-cc">
              CC <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="email-cc"
              type="email"
              value={emailCC}
              onChange={(e) => setEmailCC(e.target.value)}
              placeholder="gestor@empresa.pt"
            />
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-sm text-muted-foreground space-y-1">
            <p>
              <strong>Assunto:</strong> Resumo Financeiro - {driverName}
            </p>
            <p>
              <strong>Período:</strong> {format(dateRange.from, 'dd/MM/yyyy', { locale: pt })} a{' '}
              {format(dateRange.to, 'dd/MM/yyyy', { locale: pt })}
            </p>
            <p>
              <strong>Líquido:</strong> {fmt(liquido)}
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSendEmail} disabled={!emailTo.trim()}>
              <Mail className="h-4 w-4 mr-2" />
              Abrir no email
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
