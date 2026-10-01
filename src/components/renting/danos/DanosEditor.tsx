import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { removerFotoDano, subirFotoDano, urlFotoDano } from '@/lib/fotosDano';
// A MESMA lista que o fluxo de /realizar e o separador Danos da viatura usam.
// Escrever a localização à mão gera valores que nenhum dos dois ecrãs sabe
// traduzir — ficam a mostrar o texto em bruto.
import { LOCALIZACOES } from '@/utils/entrega';

/**
 * Registo de danos: a entidade é o DANO, as fotos são anexos dele.
 *
 * Um dano tem descrição, onde foi (da lista canónica LOCALIZACOES, não texto
 * livre), quanto custa, e as fotos que se quiser. O valor é o que chega à
 * conta do motorista, por isso tem campo próprio.
 *
 * As fotos SOBEM PARA O BUCKET NO MOMENTO EM QUE SÃO ESCOLHIDAS (pasta de
 * rascunho, ver `pastaRascunhoDanos`). Antes só subiam depois de o dano ser
 * gravado: quando o fecho do #764 falhou nos danos, as fotos tiradas no
 * terreno nunca tinham saído do telemóvel e perderam-se. Agora quem grava só
 * liga caminhos que já existem — e um rascunho guarda caminhos, não ficheiros.
 */

export type EstadoFotoDano = 'a_subir' | 'subido' | 'erro';

export interface DanoFicheiro {
  id: string;
  nome: string;
  /** MIME type. */
  tipo: string;
  /** object URL enquanto está em memória; URL assinada quando vem do bucket. */
  preview: string | null;
  /** Caminho no bucket `viatura-danos` assim que subiu — é o que se grava. */
  path: string | null;
  estado: EstadoFotoDano;
  /** Só enquanto sobe (ou por subir, vindo de um rascunho). Nunca se grava na base. */
  file?: File;
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

/** As fotos prontas a ligar ao dano: as que já estão no bucket. */
export function fotosGravaveis(dano: Pick<NovoDano, 'files'>): { path: string; nome: string }[] {
  return dano.files
    .filter((f) => f.estado === 'subido' && !!f.path)
    .map((f) => ({ path: f.path as string, nome: f.nome }));
}

/**
 * Repõe danos vindos de um rascunho (IndexedDB) em estado utilizável.
 *
 * Os `File` sobrevivem ao IndexedDB (structured clone) mas os object URLs da
 * sessão anterior não — o browser revogou-os. Uma foto com `path` já está no
 * bucket e a miniatura vem de lá; uma só com `file` ainda não subiu e o editor
 * sobe-a ao montar. Sem nenhum dos dois não há nada a repor.
 * Aceita o formato antigo ({ id, file, preview }) dos rascunhos já guardados.
 */
export function reidratarDanos(danos: NovoDano[] | null | undefined): NovoDano[] {
  return (danos ?? []).map((dano) => ({
    ...dano,
    files: (dano.files ?? [])
      .filter((f) => !!f.path || f.file instanceof File)
      .map((f) => ({
        id: f.id,
        nome: f.nome ?? f.file?.name ?? 'foto',
        tipo: f.tipo ?? f.file?.type ?? '',
        path: f.path ?? null,
        estado: f.path ? ('subido' as const) : ('a_subir' as const),
        file: f.file instanceof File ? f.file : undefined,
        preview:
          f.file instanceof File && f.file.type.startsWith('image/')
            ? URL.createObjectURL(f.file)
            : null,
      })),
  }));
}

/** Descrição é o mínimo: um dano sem ela não diz nada a quem o ler depois. */
export function validarDanos(danos: NovoDano[]): string | null {
  if (danos.some((d) => !d.descricao.trim())) {
    return 'Todos os danos adicionados têm de ter descrição.';
  }
  if (danos.some((d) => d.valor.trim() !== '' && Number.isNaN(Number(d.valor)))) {
    return 'O valor do dano tem de ser um número.';
  }
  if (danos.some((d) => d.files.some((f) => f.estado === 'a_subir'))) {
    return 'Há fotos ainda a carregar — aguarde um instante.';
  }
  if (danos.some((d) => d.files.some((f) => f.estado === 'erro'))) {
    return 'Há fotos que não conseguiram subir. Tente de novo ou remova-as.';
  }
  return null;
}

interface Props {
  danos: NovoDano[];
  onChange: (danos: NovoDano[]) => void;
  /** Pasta no bucket para onde as fotos sobem ao ser escolhidas — ver `pastaRascunhoDanos`. */
  pastaUpload: string;
  /** Some quando não há viatura a que ligar o dano (ex.: viatura slot). */
  disabled?: boolean;
  className?: string;
}

const novoId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function DanosEditor({ danos, onChange, pastaUpload, disabled, className }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Qual o dano que está à espera de ficheiros — os dois inputs são
  // partilhados por todos os danos.
  const [danoActivo, setDanoActivo] = useState<string | null>(null);

  // Um upload acaba depois de o utilizador já ter mexido noutra coisa: toda a
  // alteração parte do estado MAIS RECENTE, não do `danos` de quando o upload
  // começou. Sem isto, duas fotos a acabar seguidas perdiam uma.
  const danosRef = useRef(danos);
  danosRef.current = danos;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const emitir = useCallback((novo: NovoDano[]) => {
    danosRef.current = novo;
    onChangeRef.current(novo);
  }, []);

  const actualizarFicheiro = useCallback(
    (danoId: string, fileId: string, campos: Partial<DanoFicheiro>) => {
      const dano = danosRef.current.find((d) => d.id === danoId);
      // Removido entretanto: nada a actualizar.
      if (!dano?.files.some((f) => f.id === fileId)) return;
      emitir(
        danosRef.current.map((d) =>
          d.id !== danoId
            ? d
            : { ...d, files: d.files.map((f) => (f.id === fileId ? { ...f, ...campos } : f)) }
        )
      );
    },
    [emitir]
  );

  // Sobe o que estiver por subir — escolhido agora ou vindo de um rascunho.
  const emCurso = useRef(new Set<string>());
  useEffect(() => {
    for (const dano of danos) {
      for (const f of dano.files) {
        if (f.estado !== 'a_subir' || emCurso.current.has(f.id)) continue;
        if (!f.file) {
          actualizarFicheiro(dano.id, f.id, { estado: 'erro' });
          continue;
        }
        emCurso.current.add(f.id);
        void subirFotoDano(pastaUpload, f.file)
          .then((path) =>
            actualizarFicheiro(dano.id, f.id, { path, estado: 'subido', file: undefined })
          )
          .catch((e: unknown) => {
            console.error('[DanosEditor] Upload da foto falhou:', e);
            actualizarFicheiro(dano.id, f.id, { estado: 'erro' });
          })
          .finally(() => emCurso.current.delete(f.id));
      }
    }
  }, [danos, pastaUpload, actualizarFicheiro]);

  // Miniatura das fotos que já estão no bucket (rascunho reposto).
  const previewsPedidos = useRef(new Set<string>());
  useEffect(() => {
    for (const dano of danos) {
      for (const f of dano.files) {
        if (f.preview || !f.path || !f.tipo.startsWith('image/')) continue;
        if (previewsPedidos.current.has(f.id)) continue;
        previewsPedidos.current.add(f.id);
        void urlFotoDano(f.path).then((url) => {
          if (url) actualizarFicheiro(dano.id, f.id, { preview: url });
        });
      }
    }
  }, [danos, actualizarFicheiro]);

  const actualizar = (id: string, campos: Partial<NovoDano>) =>
    emitir(danosRef.current.map((d) => (d.id === id ? { ...d, ...campos } : d)));

  const adicionar = () => emitir([...danosRef.current, novoDanoVazio()]);

  const libertar = (f: DanoFicheiro) => {
    if (f.preview?.startsWith('blob:')) URL.revokeObjectURL(f.preview);
    if (f.path) void removerFotoDano(f.path);
  };

  const remover = (id: string) => {
    danosRef.current.find((d) => d.id === id)?.files.forEach(libertar);
    emitir(danosRef.current.filter((d) => d.id !== id));
  };

  const adicionarFicheiros = (id: string, lista: FileList | null) => {
    if (!lista?.length) return;
    const dano = danosRef.current.find((d) => d.id === id);
    if (!dano) return;
    const novos: DanoFicheiro[] = Array.from(lista).map((file) => ({
      id: novoId(),
      nome: file.name,
      tipo: file.type,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      path: null,
      estado: 'a_subir',
      file,
    }));
    actualizar(id, { files: [...dano.files, ...novos] });
  };

  const removerFicheiro = (danoId: string, fileId: string) => {
    const dano = danosRef.current.find((d) => d.id === danoId);
    const alvo = dano?.files.find((f) => f.id === fileId);
    if (!dano || !alvo) return;
    libertar(alvo);
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
                  <div className="relative h-12 w-12 overflow-hidden rounded border border-border bg-muted">
                    {f.preview ? (
                      <img src={f.preview} alt={f.nome} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
                        {f.tipo === 'application/pdf'
                          ? 'PDF'
                          : f.tipo.startsWith('video/')
                            ? 'vídeo'
                            : '…'}
                      </div>
                    )}
                    {f.estado === 'a_subir' && (
                      <div
                        className="absolute inset-0 flex items-center justify-center bg-background/60"
                        title="A carregar…"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" aria-label="A carregar" />
                      </div>
                    )}
                    {f.estado === 'erro' && (
                      <button
                        type="button"
                        onClick={() =>
                          f.file && actualizarFicheiro(dano.id, f.id, { estado: 'a_subir' })
                        }
                        title="A foto não subiu — tentar de novo"
                        aria-label={`Tentar de novo ${f.nome}`}
                        className="absolute inset-0 flex items-center justify-center bg-destructive/70 text-white"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removerFicheiro(dano.id, f.id)}
                    aria-label={`Remover ${f.nome}`}
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
