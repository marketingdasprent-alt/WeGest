import { useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Gauge, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { avisoSalto, useRegistoKm, validarKm } from '@/hooks/useRegistoKm';
import { useMotoristaViaturaAtual } from '@/hooks/useMotoristaViaturaAtual';
import { useKmDaSemana } from '@/hooks/useKmDaSemana';

interface Props {
  motoristaId: string;
}

/**
 * Registo do KM por fotografia, no painel do motorista.
 *
 * Fotografa → a IA lê → o motorista confirma ou corrige → o KM da viatura é
 * actualizado. A confirmação é sempre dele: a leitura poupa-lhe escrever, não
 * decide por ele. Se a leitura falhar, o campo fica vazio e editável em vez de
 * o deixar preso.
 */
export function MotoristaRegistarKmCard({ motoristaId }: Props) {
  const {
    data: viatura,
    isLoading: aCarregar,
    error: erro,
  } = useMotoristaViaturaAtual(motoristaId);
  const { data: semana } = useKmDaSemana(motoristaId);
  const { lerFoto, registar, aLer, aGravar } = useRegistoKm();
  const cameraRef = useRef<HTMLInputElement>(null);
  const ficheiroRef = useRef<HTMLInputElement>(null);

  const [aberto, setAberto] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fotoPath, setFotoPath] = useState<string | null>(null);
  const [kmLido, setKmLido] = useState<number | null>(null);
  const [valor, setValor] = useState('');
  // Confirmação explícita. O número vem sugerido pela leitura automática, e um
  // botão sozinho aceita-se por reflexo — este visto obriga a olhar para o
  // número antes de o gravar, que é o ponto todo do passo de confirmação.
  const [confirmado, setConfirmado] = useState(false);

  const kmAtual = viatura?.kmAtual ?? null;
  // Sem resposta ainda trata-se como entregue: um aviso a piscar durante o
  // carregamento assusta sem motivo, e corrige-se sozinho num instante.
  const porEntregar = semana ? !semana.entregue : false;

  const fechar = () => {
    setAberto(false);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFotoPath(null);
    setKmLido(null);
    setValor('');
    setConfirmado(false);
  };

  const escolher = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setAberto(true);

    const { fotoPath: path, km, erro } = await lerFoto(file, motoristaId);
    setFotoPath(path);
    setKmLido(km);
    setValor(km != null ? String(km) : '');
    setConfirmado(false);

    if (km == null) {
      toast.info(
        erro
          ? 'Não foi possível ler a fotografia. Escreva os quilómetros à mão.'
          : 'Não conseguimos ler o número. Escreva os quilómetros à mão.'
      );
    }
  };

  const confirmar = async () => {
    const km = valor.trim() ? Number(valor.trim()) : null;
    const erro = validarKm(km, kmAtual);
    if (erro) {
      toast.error(erro);
      return;
    }
    // O botão já está desactivado sem o visto, mas a regra não pode viver só
    // num `disabled` — é o que fica gravado como declaração do motorista.
    if (!confirmado) {
      toast.error('Confirme que os quilómetros estão correctos.');
      return;
    }

    if (!viatura) return;
    const falha = await registar({
      motoristaId,
      viaturaId: viatura.viaturaId,
      kmAtual,
      kmLido,
      kmConfirmado: km!,
      fotoPath,
    });
    if (falha) {
      toast.error('Não foi possível guardar os quilómetros. Tente novamente.');
      console.error('registar km:', falha);
      return;
    }

    toast.success(`Quilómetros actualizados: ${km!.toLocaleString('pt-PT')} km`);
    fechar();
  };

  const kmNumero = valor.trim() ? Number(valor.trim()) : null;
  const erroValidacao = kmNumero != null ? validarKm(kmNumero, kmAtual) : null;
  const aviso = kmNumero != null && !erroValidacao ? avisoSalto(kmNumero, kmAtual) : null;

  // Sem viatura atribuída o cartão aparece na mesma, a dizer porquê. Antes
  // devolvia null e desaparecia em silêncio — quem não o via não tinha forma
  // de saber se era falta de viatura, falha a carregar, ou funcionalidade que
  // não chegou a subir.
  if (!viatura) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            Registar quilómetros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {aCarregar
              ? 'A carregar a viatura…'
              : erro
                ? 'Não foi possível carregar a viatura. Recarregue a página.'
                : 'Sem viatura atribuída de momento. Assim que tiver uma, pode registar aqui os quilómetros.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Falta de KM é impedimento a receber, por isso o cartão muda de cor e
          não se limita a estar disponível: enquanto a semana não estiver
          entregue, é a coisa mais visível do painel. */}
      <Card className={porEntregar ? 'border-amber-400 dark:border-amber-700' : undefined}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gauge className={cn('h-4 w-4', porEntregar ? 'text-amber-600' : 'text-emerald-600')} />
            Quilómetros da semana
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {viatura?.matricula ?? '—'}
            {kmAtual != null && ` · ${kmAtual.toLocaleString('pt-PT')} km registados`}
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {porEntregar ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Falta enviar os quilómetros desta semana.</strong> É preciso para o acerto
                ser processado.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                Quilómetros desta semana entregues
                {semana?.km != null && `: ${semana.km.toLocaleString('pt-PT')} km`}.
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Fotografe o conta-quilómetros. Lemos o número e mostramos-lho para confirmar.
          </p>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void escolher(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={ficheiroRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void escolher(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => cameraRef.current?.click()} className="gap-2">
              <Camera className="h-4 w-4" />
              Fotografar
            </Button>
            <Button
              variant="outline"
              onClick={() => ficheiroRef.current?.click()}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Galeria
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={(v) => !v && !aGravar && fechar()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirme os quilómetros</DialogTitle>
            <DialogDescription>
              {aLer ? 'A ler a fotografia…' : 'Verifique o número e corrija-o se estiver errado.'}
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <img
              src={preview}
              alt="Fotografia do conta-quilómetros"
              className="max-h-44 w-full rounded-md border object-contain"
            />
          )}

          {aLer ? (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A ler…
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="km-confirmar" className="text-xs">
                Quilómetros <span className="text-destructive">*</span>
              </Label>
              <Input
                id="km-confirmar"
                type="number"
                inputMode="numeric"
                value={valor}
                onChange={(e) => {
                  setValor(e.target.value);
                  // Mexer no número anula a confirmação: o visto era sobre o
                  // valor anterior, não sobre este.
                  setConfirmado(false);
                }}
                placeholder="Ex: 147829"
                autoFocus
                className={erroValidacao ? 'border-destructive' : ''}
              />
              {erroValidacao && <p className="text-xs text-destructive">{erroValidacao}</p>}
              {aviso && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                  {aviso}
                </p>
              )}
              {kmLido != null && kmNumero !== kmLido && (
                <p className="text-xs text-muted-foreground">
                  Tínhamos lido {kmLido.toLocaleString('pt-PT')} km.
                </p>
              )}

              <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/40 p-2.5">
                <Checkbox
                  checked={confirmado}
                  onCheckedChange={(v) => setConfirmado(v === true)}
                  disabled={!!erroValidacao || !valor.trim()}
                  className="mt-0.5"
                />
                <span className="text-xs leading-snug">
                  Confirmo que os quilómetros indicados correspondem ao que está no
                  conta-quilómetros da viatura.
                </span>
              </label>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={fechar} disabled={aGravar}>
              Cancelar
            </Button>
            <Button
              onClick={confirmar}
              disabled={aLer || aGravar || !!erroValidacao || !valor.trim() || !confirmado}
            >
              {aGravar && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
