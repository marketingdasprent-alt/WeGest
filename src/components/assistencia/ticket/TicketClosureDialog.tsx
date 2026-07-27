import React, { useRef } from 'react';
import { AssistenciaMultimediaUpload } from '@/components/assistencia/AssistenciaMultimediaUpload';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2,
  Wrench,
  Image,
  Loader2,
  X,
  Paperclip,
  Building2,
  Coins,
  Clock,
  ParkingSquare,
  RefreshCw,
} from 'lucide-react';
import type { Ticket, Viatura, ClosureData } from './types';

interface Props {
  open: boolean;
  isEditMode: boolean;
  closureLoading: boolean;
  closureData: ClosureData;
  closureDecisao: 'motorista' | 'empresa' | 'aberto' | null;
  closureSubstDecisao: 'devolver' | 'definitivo' | null;
  ticket: Ticket;
  viatura: Viatura | null;
  viaturaSubstituta: Viatura | null;
  faturaFile: File | null;
  onClosureDataChange: (data: Partial<ClosureData>) => void;
  onDecisaoChange: (d: 'motorista' | 'empresa' | 'aberto') => void;
  onSubstDecisaoChange: (d: 'devolver' | 'definitivo') => void;
  onFaturaChange: (file: File | null) => void;
  onExitMediaChange: (files: { url: string; path: string; type: 'image' | 'video' }[]) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const COMBUSTIVEL_OPTIONS = [
  { value: 'vazio', label: 'Vazio' },
  { value: 'reserva', label: 'Reserva' },
  { value: '1/4', label: '1/4' },
  { value: 'meio', label: '1/2 (Meio)' },
  { value: '3/4', label: '3/4' },
  { value: 'cheio', label: 'Cheio' },
];

const ADBLUE_OPTIONS = ['Cheio', 'Meio', 'Reserva', 'Vazio', 'Não aplicável'];
const LIMPEZA_OPTIONS = ['Limpa', 'Razoável', 'Suja', 'Muito Suja'];

export const TicketClosureDialog: React.FC<Props> = ({
  open,
  isEditMode,
  closureLoading,
  closureData,
  closureDecisao,
  closureSubstDecisao,
  ticket,
  viatura,
  viaturaSubstituta,
  faturaFile,
  onClosureDataChange,
  onDecisaoChange,
  onSubstDecisaoChange,
  onFaturaChange,
  onExitMediaChange,
  onSubmit,
  onClose,
}) => {
  const faturaInputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl flex flex-col h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {isEditMode ? (
              <Wrench className="h-5 w-5 text-primary" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            )}
            {isEditMode ? 'Editar Detalhes da Reparação' : 'Concluir Reparação (Viatura Reparada)'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Preencha os dados de fecho desta assistência.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                KM Final{' '}
                {!closureData.km_fim_indisponivel && <span className="text-destructive">*</span>}
              </Label>
              <Input
                type="number"
                placeholder="Quilometragem atual"
                value={closureData.km_fim_indisponivel ? '' : closureData.km_fim}
                disabled={closureData.km_fim_indisponivel}
                onChange={(e) => onClosureDataChange({ km_fim: e.target.value })}
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="km_fim_indisponivel"
                  checked={closureData.km_fim_indisponivel}
                  onCheckedChange={(checked) =>
                    onClosureDataChange({ km_fim_indisponivel: !!checked })
                  }
                />
                <Label
                  htmlFor="km_fim_indisponivel"
                  className="text-xs font-normal text-muted-foreground cursor-pointer"
                >
                  KM não disponível (ex.: viatura não liga)
                </Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Combustível Final</Label>
              <Select
                value={closureData.combustivel_fim}
                onValueChange={(val) => onClosureDataChange({ combustivel_fim: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMBUSTIVEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor Total (€)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={closureData.valor_reparacao}
                onChange={(e) => onClosureDataChange({ valor_reparacao: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>AdBlue Final</Label>
              <Select
                value={closureData.adblue_fim}
                onValueChange={(val) => onClosureDataChange({ adblue_fim: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADBLUE_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Limpeza Final</Label>
              <Select
                value={closureData.limpeza_fim}
                onValueChange={(val) => onClosureDataChange({ limpeza_fim: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIMPEZA_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Resumo da Reparação</Label>
            <Textarea
              placeholder="O que foi reparado..."
              value={closureData.descricao_reparacao}
              onChange={(e) => onClosureDataChange({ descricao_reparacao: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nº Fatura</Label>
              <Input
                placeholder="Ex: FT 2026/123"
                value={closureData.numero_fatura}
                onChange={(e) => onClosureDataChange({ numero_fatura: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Anexar Fatura</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => faturaInputRef.current?.click()}
                  className="flex-1"
                >
                  <Paperclip className="h-4 w-4 mr-2" />
                  {faturaFile ? faturaFile.name : 'Selecionar ficheiro'}
                </Button>
                {faturaFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onFaturaChange(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                <input
                  ref={faturaInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => onFaturaChange(e.target.files?.[0] || null)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <Label className="text-base font-bold flex items-center gap-2">
              <Image className="h-5 w-5 text-blue-500" /> Multimédia de Saída
            </Label>
            <p className="text-sm text-muted-foreground">
              Registe o estado da viatura no momento da entrega.
            </p>
            <AssistenciaMultimediaUpload
              onFilesChange={onExitMediaChange}
              requiredPhotos={0}
              requiredVideos={0}
            />
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label className="font-semibold">
              Responsabilidade Financeira ({viatura?.matricula})
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  {
                    val: 'motorista' as const,
                    icon: <Coins className="h-4 w-4 text-orange-500" />,
                    label: 'Cobrar do Motorista',
                    desc: 'Gera débito na conta do motorista',
                    activeClass: 'border-orange-500 bg-orange-500/10',
                  },
                  {
                    val: 'empresa' as const,
                    icon: <Building2 className="h-4 w-4 text-blue-500" />,
                    label: 'Cobrar da Empresa',
                    desc: 'Registado como despesa da viatura',
                    activeClass: 'border-blue-500 bg-blue-500/10',
                  },
                  {
                    val: 'aberto' as const,
                    icon: <Clock className="h-4 w-4 text-yellow-600" />,
                    label: 'Deixar Em Aberto',
                    desc: 'Gera aviso na ficha até ser definido',
                    activeClass: 'border-yellow-500 bg-yellow-500/10',
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => onDecisaoChange(opt.val)}
                  className={`rounded-lg border-2 p-3 text-left transition-all ${
                    closureDecisao === opt.val
                      ? opt.activeClass
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium text-sm">
                    {opt.icon} {opt.label}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {ticket.viatura_substituta_id && viaturaSubstituta && (
            <div className="space-y-2 border-t pt-4">
              <Label className="font-semibold">
                O que fazer com a viatura substituta ({viaturaSubstituta.matricula})?
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(
                  [
                    {
                      val: 'devolver' as const,
                      icon: <ParkingSquare className="h-4 w-4" />,
                      label: 'Devolver ao parque',
                      desc: 'Encerra associação temporária, fica disponível',
                      activeClass: 'border-blue-500 bg-blue-500/10',
                    },
                    {
                      val: 'definitivo' as const,
                      icon: <RefreshCw className="h-4 w-4" />,
                      label: 'Manter com o motorista',
                      desc: 'Passa a associação definitiva, continua em uso',
                      activeClass: 'border-green-500 bg-green-500/10',
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => onSubstDecisaoChange(opt.val)}
                    className={`rounded-lg border-2 p-3 text-left transition-all ${
                      closureSubstDecisao === opt.val
                        ? opt.activeClass
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-medium text-sm">
                      {opt.icon} {opt.label}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={closureLoading}>
            {closureLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditMode ? 'Guardar Alterações' : 'Concluir Reparação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
