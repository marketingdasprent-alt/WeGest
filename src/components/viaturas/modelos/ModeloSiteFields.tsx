import { useState } from 'react';
import { ImageUp, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/utils/errorMessage';
import { caminhoFotoModelo, validarFotoModelo, type ModeloSiteInput } from './modeloSite.schema';

interface Props {
  value: ModeloSiteInput;
  onChange: (value: ModeloSiteInput) => void;
  /** null num modelo novo: a foto só se carrega depois de o guardar. */
  modeloId: string | null;
  orgId: string | null;
}

const BUCKET = 'modelos-viaturas';
const SEM_CAIXA = 'nenhuma';

const numeroOuNulo = (texto: string): number | null => (texto === '' ? null : Number(texto));

/** Características e foto do modelo que o site de rent-a-car mostra. */
export function ModeloSiteFields({ value, onChange, modeloId, orgId }: Props) {
  const [aCarregar, setACarregar] = useState(false);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const set = <K extends keyof ModeloSiteInput>(k: K, v: ModeloSiteInput[K]) =>
    onChange({ ...value, [k]: v });

  const carregarFoto = async (ficheiro: File | undefined) => {
    if (!ficheiro || !modeloId || !orgId) return;
    const invalido = validarFotoModelo(ficheiro);
    if (invalido) return setErroFoto(invalido);
    setErroFoto(null);
    setACarregar(true);
    try {
      const caminho = caminhoFotoModelo(orgId, modeloId, ficheiro);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(caminho, ficheiro, { upsert: true, contentType: ficheiro.type });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
      // O caminho é o mesmo a cada troca: o ?v= fura a cache do CDN e do site.
      set('imagem_url', `${data.publicUrl}?v=${Date.now()}`);
    } catch (e: unknown) {
      setErroFoto(errorMessage(e, 'Não foi possível carregar a foto.'));
    } finally {
      setACarregar(false);
    }
  };

  return (
    <fieldset className="space-y-3 rounded-md border border-border/60 p-3">
      <legend className="px-1 text-sm font-medium">Dados para o site de rent-a-car</legend>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="modelo-caixa">Caixa</Label>
          <Select
            value={value.caixa ?? SEM_CAIXA}
            onValueChange={(v) =>
              set('caixa', v === SEM_CAIXA ? null : (v as ModeloSiteInput['caixa']))
            }
          >
            <SelectTrigger id="modelo-caixa">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_CAIXA}>—</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="automatica">Automática</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(
          [
            ['lugares', 'Lugares', 1, 9],
            ['portas', 'Portas', 2, 6],
            ['bagageira', 'Bagageira (malas)', 0, 10],
          ] as const
        ).map(([campo, rotulo, min, max]) => (
          <div key={campo} className="space-y-1.5">
            <Label htmlFor={`modelo-${campo}`}>{rotulo}</Label>
            <Input
              id={`modelo-${campo}`}
              type="number"
              min={min}
              max={max}
              value={value[campo] ?? ''}
              onChange={(e) => set(campo, numeroOuNulo(e.target.value))}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="modelo-ac"
          checked={value.ar_condicionado}
          onCheckedChange={(v) => set('ar_condicionado', v)}
        />
        <Label htmlFor="modelo-ac">Ar condicionado</Label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="modelo-foto">Foto do modelo</Label>
        {value.imagem_url && (
          <img
            src={value.imagem_url}
            alt="Foto do modelo para o site"
            className="h-24 w-auto rounded-md border object-contain"
          />
        )}
        {modeloId ? (
          <div className="flex items-center gap-2">
            <Input
              id="modelo-foto"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={aCarregar}
              onChange={(e) => carregarFoto(e.target.files?.[0])}
            />
            {aCarregar ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-label="A carregar" />
            ) : (
              <ImageUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Guarde o modelo primeiro para carregar a foto.
          </p>
        )}
        {erroFoto && <p className="text-xs text-destructive">{erroFoto}</p>}
        <p className="text-xs text-muted-foreground">
          Foto de marketing (JPEG, PNG ou WebP até 2 MB). Nunca uma foto com matrícula.
        </p>
      </div>
    </fieldset>
  );
}
