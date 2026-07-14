import { useRef } from 'react';
import { Camera, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { LOCALIZACOES, type FilePreview } from '@/utils/entrega';

interface StepKmCombustivelFotosProps {
  titulo: string;
  km: string;
  onKmChange: (v: string) => void;
  combustivel: string;
  onCombustivelChange: (v: string) => void;
  files: FilePreview[];
  onAddFiles: (list: FileList | null) => void;
  onUpdateFoto: (id: string, campo: 'localizacao' | 'descricao' | 'valor', valor: string) => void;
  onRemoveFile: (id: string) => void;
}

/**
 * Step de registo de KM, nível de combustível e fotos/danos.
 * Reaproveitado para entrega/recolha simples e, na troca, uma vez para cada viatura.
 */
export const StepKmCombustivelFotos: React.FC<StepKmCombustivelFotosProps> = ({
  titulo,
  km,
  onKmChange,
  combustivel,
  onCombustivelChange,
  files,
  onAddFiles,
  onUpdateFoto,
  onRemoveFile,
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <p className="text-sm font-semibold">{titulo}</p>

        <div className="space-y-2">
          <Label>
            KM Actual <span className="text-red-500">*</span>
          </Label>
          <Input
            type="number"
            inputMode="numeric"
            value={km}
            onChange={(e) => onKmChange(e.target.value)}
            placeholder="Ex: 45120"
          />
        </div>

        <div className="space-y-2">
          <Label>
            Combustível <span className="text-red-500">*</span>
          </Label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {['Reserva', '1/4', '1/2', '3/4', 'Cheio'].map((nivel) => (
              <button
                key={nivel}
                type="button"
                onClick={() => onCombustivelChange(nivel)}
                className={`rounded-md border-2 py-2 text-sm font-medium transition-colors ${
                  combustivel === nivel
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                {nivel}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Fotos / Vídeos</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => cameraInputRef.current?.click()}
              className="gap-2"
            >
              <Camera className="h-4 w-4" />
              Câmara
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Galeria
            </Button>
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => onAddFiles(e.target.files)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => onAddFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div className="space-y-3 mt-3">
            <p className="text-xs text-muted-foreground">
              Descreve cada foto (localização, descrição e valor) — vai para a tabela de danos da
              folha.
            </p>
            {files.map((f) => (
              <div key={f.id} className="flex flex-col gap-3 rounded-md border p-2 sm:flex-row">
                <div className="relative mx-auto shrink-0 sm:mx-0">
                  <img
                    src={f.url}
                    alt={f.file.name}
                    className="h-24 w-24 rounded border object-cover sm:h-20 sm:w-20"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveFile(f.id)}
                    className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                  <select
                    value={f.localizacao}
                    onChange={(e) => onUpdateFoto(f.id, 'localizacao', e.target.value)}
                    className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Localização…</option>
                    {LOCALIZACOES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="Valor (€)"
                    value={f.valor}
                    onChange={(e) => onUpdateFoto(f.id, 'valor', e.target.value)}
                    className="h-9 min-w-0"
                  />
                  <Input
                    placeholder="Descrição do dano"
                    value={f.descricao}
                    onChange={(e) => onUpdateFoto(f.id, 'descricao', e.target.value)}
                    className="col-span-2 h-9 min-w-0"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
