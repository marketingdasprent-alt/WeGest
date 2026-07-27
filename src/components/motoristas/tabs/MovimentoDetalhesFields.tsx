import type { RefObject } from 'react';
import { Paperclip, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CATEGORIAS } from './NovoMovimentoFinanceiroOverlay';

export interface MovimentoDetalhesFieldsProps {
  isAcordo: boolean;
  categoria: string;
  onCategoriaChange: (value: string) => void;
  descricao: string;
  onDescricaoChange: (value: string) => void;
  valor: string;
  onValorChange: (value: string) => void;
  referencia: string;
  onReferenciaChange: (value: string) => void;
  faturaUrlExistente: string | null;
  faturaFile: File | null;
  onFaturaFileChange: (file: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement>;
}

export function MovimentoDetalhesFields({
  isAcordo,
  categoria,
  onCategoriaChange,
  descricao,
  onDescricaoChange,
  valor,
  onValorChange,
  referencia,
  onReferenciaChange,
  faturaUrlExistente,
  faturaFile,
  onFaturaFileChange,
  fileInputRef,
}: MovimentoDetalhesFieldsProps) {
  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold">Detalhes do Movimento</h2>

      {!isAcordo && (
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select value={categoria} onValueChange={onCategoriaChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar categoria (opcional)" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>
          Descrição <span className="text-destructive">*</span>
        </Label>
        <Textarea
          placeholder="Ex: Caução semana 1, Salário Janeiro..."
          value={descricao}
          onChange={(e) => onDescricaoChange(e.target.value)}
          rows={3}
          autoFocus={!isAcordo}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>
            Valor Total (€) <span className="text-destructive">*</span>
          </Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={valor}
            onChange={(e) => onValorChange(e.target.value)}
            disabled={isAcordo}
            className={isAcordo ? 'bg-muted font-semibold' : ''}
          />
          {isAcordo && (
            <p className="text-xs text-muted-foreground">
              Valor bloqueado — definido pelo gestor de assistência.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Fatura / Referência</Label>
          <Input
            placeholder="Ex: FT 2026/123"
            value={referencia}
            onChange={(e) => onReferenciaChange(e.target.value)}
          />
        </div>
      </div>

      {/* Fatura da assistência — se foi anexada no fecho do ticket */}
      {faturaUrlExistente && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-3 py-2">
          <FileText className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="text-xs text-blue-700 flex-1">
            Fatura anexada pelo gestor de assistência
          </span>
          <a
            href={faturaUrlExistente}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Ver fatura
          </a>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Anexar Fatura (opcional)</Label>
        <div className="flex items-center gap-3">
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => onFaturaFileChange(e.target.files?.[0] || null)}
          />
          <Button
            variant="outline"
            className="w-full justify-start gap-2 border-dashed"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
            {faturaFile ? faturaFile.name : 'Selecionar ficheiro...'}
          </Button>
          {faturaFile && (
            <Button variant="ghost" size="icon" onClick={() => onFaturaFileChange(null)}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
