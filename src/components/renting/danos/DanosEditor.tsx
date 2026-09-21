import { useRef, useState } from 'react';
import { Camera, Plus, Trash2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
// A MESMA lista que o fluxo de /realizar e o separador Danos da viatura usam.
// Escrever a localização à mão (como faz o CheckinDadosSection do calendário)
// gera valores que nenhum dos dois ecrãs sabe traduzir — ficam a mostrar o
// texto em bruto. Em produção ainda não há nenhum fora da lista; que assim
// continue.
import { LOCALIZACOES } from '@/utils/entrega';

/**
 * Registo de danos: a entidade é o DANO, as fotos são anexos dele.
 *
 * Existiam três formas de registar um dano, cada uma com o seu modelo:
 *  - Calendário (CheckinDadosSection): dano com descrição e localização, sem
 *    campo de valor — todos os danos por ali ficavam gravados a 0 €.
 *  - Contrato → /realizar (StepKmCombustivelFotos): os campos estão presos à
 *    foto, portanto sem foto não há forma de registar o dano.
 *  - Fecho de contrato: nem sequer havia danos — as fotos iam todas para um
 *    único registo chamado "Registo recolha", sem localização e a 0 €.
 *
 * Este componente é o modelo a usar daqui para a frente: um dano tem
 * descrição, onde foi (da lista canónica LOCALIZACOES, não texto livre),
 * quanto custa, e as fotos que se quiser (ou nenhuma). O valor é o que chega
 * à conta do motorista, por isso tem campo próprio e não se deduz de lado
 * nenhum.
 */

export interface DanoFicheiro {
  id: string;
  file: File;
  preview: string | null;
}

export interface NovoDano {
  id: string;
  descricao: string;
  localizacao: string;
  /** Em euros, como texto (é o que o input dá). Vazio = sem valor atribuído. */
  valor: string;
  files: DanoFicheiro[];
}

export function novoDanoVazio(): NovoDano {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    descricao: '',
    localizacao: '',
    valor: '',
    files: [],
  };
}

/** Descrição é o mínimo: um dano sem ela não diz nada a quem o ler depois. */
export function validarDanos(danos: NovoDano[]): string | null {
  if (danos.some((d) => !d.descricao.trim())) {
    return 'Todos os danos adicionados têm de ter descrição.';
  }
  if (danos.some((d) => d.valor.trim() !== '' && Number.isNaN(Number(d.valor)))) {
    return 'O valor do dano tem de ser um número.';
  }
  return null;
}

interface Props {
  danos: NovoDano[];
  onChange: (danos: NovoDano[]) => void;
  /** Some quando não há viatura a que ligar o dano (ex.: viatura slot). */
  disabled?: boolean;
  className?: string;
}

export function DanosEditor({ danos, onChange, disabled, className }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Qual o dano que está à espera de ficheiros — os dois inputs são
  // partilhados por todos os danos (um par de inputs por dano dava dezenas de
  // nós escondidos no DOM).
  const [danoActivo, setDanoActivo] = useState<string | null>(null);

  const actualizar = (id: string, campos: Partial<NovoDano>) =>
    onChange(danos.map((d) => (d.id === id ? { ...d, ...campos } : d)));

  const adicionar = () => onChange([...danos, novoDanoVazio()]);

  const remover = (id: string) => {
    const dano = danos.find((d) => d.id === id);
    dano?.files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    onChange(danos.filter((d) => d.id !== id));
  };

  const adicionarFicheiros = (id: string, lista: FileList | null) => {
    if (!lista?.length) return;
    const novos = Array.from(lista).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
    const dano = danos.find((d) => d.id === id);
    if (!dano) return;
    actualizar(id, { files: [...dano.files, ...novos] });
  };

  const removerFicheiro = (danoId: string, fileId: string) => {
    const dano = danos.find((d) => d.id === danoId);
    if (!dano) return;
    const alvo = dano.files.find((f) => f.id === fileId);
    if (alvo?.preview) URL.revokeObjectURL(alvo.preview);
    actualizar(danoId, { files: dano.files.filter((f) => f.id !== fileId) });
  };

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,application/pdf"
        multiple
        hidden
        onChange={(e) => {
          if (danoActivo) adicionarFicheiros(danoActivo, e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          if (danoActivo) adicionarFicheiros(danoActivo, e.target.files);
          e.target.value = '';
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Danos</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={adicionar}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar Dano
        </Button>
      </div>

      {danos.length === 0 && (
        <p className="text-xs italic text-muted-foreground">
          Nenhum dano registado. Carrega em "Adicionar Dano" se encontrares algum.
        </p>
      )}

      {danos.map((dano) => (
        <div
          key={dano.id}
          className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3"
        >
          <div className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_1fr_110px]">
              <Input
                value={dano.descricao}
                onChange={(e) => actualizar(dano.id, { descricao: e.target.value })}
                placeholder="Descrição do dano *"
                className="h-8 text-xs"
                aria-label="Descrição do dano"
              />
              <select
                value={dano.localizacao}
                onChange={(e) => actualizar(dano.id, { localizacao: e.target.value })}
                className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs"
                aria-label="Localização do dano"
              >
                <option value="">Onde…</option>
                {LOCALIZACOES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Input
                  value={dano.valor}
                  onChange={(e) => actualizar(dano.id, { valor: e.target.value })}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  className="h-8 pr-6 text-xs"
                  aria-label="Valor do dano em euros"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  €
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-destructive"
              onClick={() => remover(dano.id)}
              aria-label="Remover dano"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setDanoActivo(dano.id);
                setTimeout(() => cameraInputRef.current?.click(), 50);
              }}
              className="flex items-center justify-center gap-1.5 rounded border border-dashed border-destructive/40 py-2 text-xs text-muted-foreground transition-colors hover:bg-destructive/5"
            >
              <Camera className="h-3.5 w-3.5" /> Câmara
            </button>
            <button
              type="button"
              onClick={() => {
                setDanoActivo(dano.id);
                setTimeout(() => fileInputRef.current?.click(), 50);
              }}
              className="flex items-center justify-center gap-1.5 rounded border border-dashed border-destructive/40 py-2 text-xs text-muted-foreground transition-colors hover:bg-destructive/5"
            >
              <Upload className="h-3.5 w-3.5" /> Ficheiros
            </button>
          </div>

          {dano.files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {dano.files.map((f) => (
                <div key={f.id} className="relative">
                  <div className="h-12 w-12 overflow-hidden rounded border border-border bg-muted">
                    {f.preview ? (
                      <img
                        src={f.preview}
                        alt={f.file.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
                        {f.file.type === 'application/pdf' ? 'PDF' : 'vídeo'}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removerFicheiro(dano.id, f.id)}
                    aria-label={`Remover ${f.file.name}`}
                    className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
