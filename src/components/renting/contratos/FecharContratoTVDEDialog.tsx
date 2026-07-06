import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFecharContratoTVDE } from '@/hooks/useContratosRenting';
import { useEstacoes } from '@/hooks/useEstacoes';

const schema = z.object({
  tipoEvento: z.enum(['recolhido', 'devolvido'], {
    required_error: 'Selecciona o que foi feito com a viatura.',
  }),
  estacaoId: z.string({ required_error: 'Selecciona a estação.' }).min(1, 'Selecciona a estação.'),
  dataEvento: z.string().min(1, 'A data é obrigatória'),
  motivo: z.string().optional(),
  valorDivida: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? parseFloat(v.replace(',', '.')) : undefined))
    .pipe(z.number().positive().optional()),
});

type FormValues = z.input<typeof schema>;

interface FecharContratoTVDEDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratoId: string;
  contratoCodigo: number;
  motoristaId?: string | null;
  matricula?: string | null;
}

export const FecharContratoTVDEDialog: React.FC<FecharContratoTVDEDialogProps> = ({
  open,
  onOpenChange,
  contratoId,
  contratoCodigo,
  motoristaId,
  matricula,
}) => {
  const fecharMutation = useFecharContratoTVDE();
  const { data: estacoes = [] } = useEstacoes();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipoEvento: undefined,
      estacaoId: undefined,
      dataEvento: '',
      motivo: '',
      valorDivida: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    const parsed = schema.parse(values);
    await fecharMutation.mutateAsync({
      contratoId,
      contratoCodigo,
      motoristaId,
      matricula,
      tipoEvento: parsed.tipoEvento,
      estacaoId: parsed.estacaoId,
      dataEvento: new Date(parsed.dataEvento).toISOString(),
      motivo: parsed.motivo,
      valorDivida: parsed.valorDivida,
    });
    form.reset();
    onOpenChange(false);
  };

  const isPending = fecharMutation.isPending;
  const temMotorista = !!motoristaId;

  return (
    <Dialog open={open} onOpenChange={(v) => !isPending && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fechar contrato #{contratoCodigo}</DialogTitle>
          <DialogDescription>
            Indica o que foi feito com a viatura, a data prevista e regista eventuais valores em
            dívida.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* Tipo de evento */}
          <div className="space-y-2">
            <Label>O que foi feito com a viatura? *</Label>
            <RadioGroup
              value={form.watch('tipoEvento')}
              onValueChange={(v) =>
                form.setValue('tipoEvento', v as 'recolhido' | 'devolvido', {
                  shouldValidate: true,
                })
              }
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="recolhido" id="tipo-recolhido" />
                <Label htmlFor="tipo-recolhido" className="cursor-pointer font-normal">
                  Recolhida
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="devolvido" id="tipo-devolvido" />
                <Label htmlFor="tipo-devolvido" className="cursor-pointer font-normal">
                  Devolvida
                </Label>
              </div>
            </RadioGroup>
            {form.formState.errors.tipoEvento && (
              <p className="text-sm text-destructive">{form.formState.errors.tipoEvento.message}</p>
            )}
          </div>

          {/* Estação onde a viatura fica */}
          <div className="space-y-2">
            <Label htmlFor="estacaoId">Estação *</Label>
            <Select
              value={form.watch('estacaoId')}
              onValueChange={(v) => {
                if (!v) return;
                form.setValue('estacaoId', v, { shouldValidate: true });
              }}
            >
              <SelectTrigger id="estacaoId" className="bg-background">
                <SelectValue placeholder="Selecciona a estação" />
              </SelectTrigger>
              <SelectContent>
                {estacoes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.estacaoId && (
              <p className="text-sm text-destructive">{form.formState.errors.estacaoId.message}</p>
            )}
          </div>

          {/* Data do evento */}
          <div className="space-y-2">
            <Label htmlFor="dataEvento">Data *</Label>
            <Input
              id="dataEvento"
              type="datetime-local"
              className="bg-background"
              {...form.register('dataEvento')}
            />
            {form.formState.errors.dataEvento && (
              <p className="text-sm text-destructive">{form.formState.errors.dataEvento.message}</p>
            )}
          </div>

          {/* Motivo */}
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo (opcional)</Label>
            <Textarea
              id="motivo"
              placeholder="Ex: fim de contrato, rescisão por acordo, ..."
              rows={2}
              {...form.register('motivo')}
            />
          </div>

          {/* Valor em dívida */}
          <div className="space-y-2">
            <Label htmlFor="valorDivida">
              Valor em dívida (opcional)
              {!temMotorista && (
                <span className="ml-2 text-xs text-muted-foreground">
                  — sem motorista associado, não será registado
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="valorDivida"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                className="pr-10"
                disabled={!temMotorista}
                {...form.register('valorDivida')}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                €
              </span>
            </div>
            {form.formState.errors.valorDivida && (
              <p className="text-sm text-destructive">
                {String(form.formState.errors.valorDivida.message)}
              </p>
            )}
            {temMotorista && (
              <p className="text-xs text-muted-foreground">
                O valor será registado como débito pendente no financeiro do motorista.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Fechar contrato
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
