import { useRef } from 'react';
import { AlertTriangle, Battery, Camera, Gauge, Sparkles, Upload, X, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { NivelBateriaInput } from '@/components/viaturas/NivelBateriaInput';
import { DanosEditor, type NovoDano } from '@/components/renting/danos/DanosEditor';
import { DanosExistentesPanel } from '@/components/renting/danos/DanosExistentesPanel';
import {
  COMBUSTIVEL_NIVEL_OPTS,
  GPL_OPTS,
  precisaCombustivel,
  precisaEletrico,
  precisaGpl,
} from '@/utils/combustivel';

/**
 * O registo do estado de uma viatura numa entrega, recolha, devolução ou
 * troca: KM, energia, fotos, danos novos e danos já existentes.
 *
 * É a MESMA operação em todo o lado, por isso é o mesmo componente. Havia três
 * implementações do mesmo ecrã — o fecho de contrato, o /realizar e o
 * calendário — e cada uma tinha o seu conjunto de defeitos:
 *
 *  - o fecho não pedia bateria a um eléctrico (só oitavos de depósito);
 *  - o /realizar prendia os campos do dano à foto, portanto sem foto não havia
 *    dano, e um dano com três fotos virava três danos;
 *  - o calendário não tinha campo de valor: 536 danos gravados, 0,00 € no
 *    total, nenhum alguma vez cobrado.
 *
 * A API é granular (valor + onChange por campo) de propósito: cada ecrã já
 * tinha o seu estado montado à sua maneira — o /realizar guarda dois conjuntos
 * para a troca, o calendário guarda um objecto para o rascunho em IndexedDB —
 * e obrigá-los todos a um formato comum era migrar estado a troco de nada. O
 * que tinha de ser um só é o ECRÃ, e é.
 *
 * O que fica de fora, de propósito: assinaturas, folha de danos, DUA e o
 * gravar. Isso é de cada fluxo, e as tabelas de destino nem sequer são as
 * mesmas (`contratos` no calendário, `contratos_renting` no renting).
 */

export interface RegistoViaturaSectionProps {
  /** Viatura a registar. Sem ela não se listam danos existentes. */
  viaturaId: string | null | undefined;
  /** Contrato em curso, se já existir — os danos dele não são "já existentes". */
  contratoId?: string | null;
  /** Nome do catálogo (ex.: "Elétrico", "Híbrido/Gasolina"). Decide que níveis
   *  se pedem. null/undefined = ainda a carregar, mostra combustível. */
  tipoCombustivel: string | null | undefined;

  km: string;
  onKmChange: (v: string) => void;
  /** KM registado na viatura — o novo não pode ser inferior. 0 desliga o aviso. */
  kmMinimo?: number;

  combustivel: string;
  onCombustivelChange: (v: string) => void;
  nivelEletrico: string;
  onNivelEletricoChange: (v: string) => void;
  /** GPL só onde há onde o guardar — `contratos_renting` não tem coluna. */
  nivelGpl?: string;
  onNivelGplChange?: (v: string) => void;

  danos: NovoDano[];
  onDanosChange: (danos: NovoDano[]) => void;

  /** Fotos gerais do estado da viatura (sem dano associado). Só aparecem se
   *  o ecrã as tratar — o fecho de contrato não as usa. */
  files?: { id: string; url: string; nome: string }[];
  onAddFiles?: (list: FileList | null) => void;
  onRemoveFile?: (id: string) => void;

  /** Título do painel. */
  titulo?: string;
  /** Linha de apoio por baixo do título. */
  descricao?: string;
  /** Interruptor do painel. Só aparece se `onActivoChange` vier — sem ele o
   *  painel está sempre aberto (é o caso do /realizar e do calendário, onde
   *  registar não é opcional). */
  activo?: boolean;
  onActivoChange?: (v: boolean) => void;
  /** Interruptor visível mas bloqueado (numa troca o registo é obrigatório). */
  toggleBloqueado?: boolean;
  /** Botão extra no cabeçalho — o calendário põe aqui a Folha de Danos. */
  accaoHeader?: React.ReactNode;

  className?: string;
}

export function RegistoViaturaSection({
  viaturaId,
  contratoId,
  tipoCombustivel,
  km,
  onKmChange,
  kmMinimo = 0,
  combustivel,
  onCombustivelChange,
  nivelEletrico,
  onNivelEletricoChange,
  nivelGpl,
  onNivelGplChange,
  danos,
  onDanosChange,
  files,
  onAddFiles,
  onRemoveFile,
  titulo = 'Registar a recolha agora',
  descricao,
  activo = true,
  onActivoChange,
  toggleBloqueado = false,
  accaoHeader,
  className,
}: RegistoViaturaSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Tipo desconhecido cai em combustão: é o caso mais comum, e não mostrar
  // campo nenhum enquanto o tipo carrega era pior do que mostrar o provável.
  const mostraCombustivel = tipoCombustivel == null || precisaCombustivel(tipoCombustivel);
  const mostraEletrico = precisaEletrico(tipoCombustivel);
  const mostraGpl = precisaGpl(tipoCombustivel) && !!onNivelGplChange;

  const kmInvalido = kmMinimo > 0 && !!km.trim() && Number(km) < kmMinimo;
  const mostraFotos = !!onAddFiles;

  /** Botões de nível (combustível, GPL). A bateria tem componente próprio,
   *  porque se escreve a percentagem exacta. */
  const Niveis = ({
    label,
    icone,
    opts,
    valor,
    onSelect,
  }: {
    label: string;
    icone: React.ReactNode;
    opts: readonly string[];
    valor: string;
    onSelect: (v: string) => void;
  }) => (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-xs">
        {icone}
        {label} <span className="text-destructive">*</span>
      </Label>
      <div className="flex h-9 overflow-hidden rounded-md border border-input">
        {opts.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(opt)}
            title={opt}
            className={cn(
              'flex-1 border-r border-input text-[10px] font-medium transition-colors last:border-r-0',
              valor === opt
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-foreground hover:bg-muted'
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <section
      className={cn(
        'space-y-3 rounded-xl border p-4 transition-colors',
        activo
          ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/25'
          : 'border-border bg-muted/30',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          className={cn(
            'flex items-center gap-2 text-sm font-semibold',
            activo ? 'text-emerald-900 dark:text-emerald-300' : 'text-foreground'
          )}
        >
          <Sparkles className="h-4 w-4" />
          {titulo}
        </h3>
        {accaoHeader}
        {onActivoChange && (
          <Switch
            checked={activo}
            onCheckedChange={onActivoChange}
            disabled={toggleBloqueado}
            aria-label={titulo}
          />
        )}
      </div>
      {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}

      {!activo ? null : (
        <div className="space-y-4 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-xs">
              KM Actual <span className="text-destructive">*</span>
              {kmMinimo > 0 && (
                <span className="font-normal text-muted-foreground">
                  (mín. {kmMinimo.toLocaleString()})
                </span>
              )}
            </Label>
            <Input
              type="number"
              inputMode="numeric"
              min={kmMinimo || undefined}
              value={km}
              onChange={(e) => onKmChange(e.target.value)}
              placeholder={kmMinimo > 0 ? String(kmMinimo) : 'Ex: 45120'}
              className={cn(
                'h-9 text-sm',
                kmInvalido && 'border-destructive focus-visible:ring-destructive'
              )}
            />
            {kmInvalido && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3" /> KM inferior ao registo da viatura (
                {kmMinimo.toLocaleString()})
              </p>
            )}
          </div>

          {/* Que níveis se pedem depende do combustível da viatura. Um híbrido
          mostra dois; um eléctrico não mostra depósito nenhum. */}
          <div className="space-y-3">
            {mostraCombustivel && (
              <Niveis
                label="Combustível"
                icone={<Gauge className="h-3 w-3" />}
                opts={COMBUSTIVEL_NIVEL_OPTS}
                valor={combustivel}
                onSelect={onCombustivelChange}
              />
            )}
            {mostraGpl && (
              <Niveis
                label="Nível GPL"
                icone={<Zap className="h-3 w-3 text-orange-500" />}
                opts={GPL_OPTS}
                valor={nivelGpl ?? ''}
                onSelect={(v) => onNivelGplChange?.(v)}
              />
            )}
            {mostraEletrico && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-xs">
                  <Battery className="h-3 w-3 text-green-500" />
                  Bateria Elétrica <span className="text-destructive">*</span>
                </Label>
                <NivelBateriaInput
                  valor={nivelEletrico}
                  onChange={onNivelEletricoChange}
                  compacto
                />
              </div>
            )}
          </div>

          {mostraFotos && (
            <div className="space-y-2">
              <Label className="text-xs">Fotos / Vídeos (opcional)</Label>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*,video/*"
                capture="environment"
                multiple
                hidden
                onChange={(e) => {
                  onAddFiles?.(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,application/pdf"
                multiple
                hidden
                onChange={(e) => {
                  onAddFiles?.(e.target.files);
                  e.target.value = '';
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4" /> Câmara
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> Galeria
                </Button>
              </div>
              {!!files?.length && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Fotos do estado da viatura. Um dano concreto regista-se abaixo, com o seu valor.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {files.map((f) => (
                      <div key={f.id} className="relative">
                        <img
                          src={f.url}
                          alt={f.nome}
                          className="h-20 w-20 rounded border object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => onRemoveFile?.(f.id)}
                          aria-label={`Remover ${f.nome}`}
                          className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* O que a viatura já trazia, antes de se registar o que é novo. */}
          <div className="border-t pt-3">
            <DanosExistentesPanel viaturaId={viaturaId} contratoId={contratoId} />
          </div>

          <div className="border-t pt-3">
            <DanosEditor danos={danos} onChange={onDanosChange} />
          </div>
        </div>
      )}
    </section>
  );
}
