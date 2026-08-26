import { useEffect, useState } from 'react';
import { Fuel, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NivelBateriaInput } from '@/components/viaturas/NivelBateriaInput';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTipoCombustivel } from '@/hooks/useTipoCombustivel';
import { usePreencherDadosSaidaAnyRent } from '@/hooks/useContratosRenting';
import { COMBUSTIVEL_NIVEL_OPTS, precisaCombustivel, precisaEletrico } from '@/utils/combustivel';
import type { ContratoRenting } from '@/types/contratoRenting';

interface AnyRentDadosSaidaAlertProps {
  contrato: ContratoRenting;
}

/** Banner + formulário provisórios para o gestor preencher km/combustível/
 *  bateria de saída em contratos marcados como entregues via o atalho "Any
 *  Rent" (ContratoForm.tsx) — esse atalho salta o check-in, por isso estes
 *  campos ficam NULL para sempre a menos que alguém os preencha à mão aqui.
 *  Some sozinho assim que os campos relevantes ficam preenchidos. */
export function AnyRentDadosSaidaAlert({ contrato }: AnyRentDadosSaidaAlertProps) {
  const [open, setOpen] = useState(false);
  const [kmStr, setKmStr] = useState('');
  const [combustivel, setCombustivel] = useState('');
  const [eletricidade, setEletricidade] = useState('');

  const { data: tipoCombustivel } = useTipoCombustivel(contrato.viatura_id);
  const preencherMut = usePreencherDadosSaidaAnyRent();

  const mostraCombustivel = tipoCombustivel == null || precisaCombustivel(tipoCombustivel);
  const mostraEletrico = precisaEletrico(tipoCombustivel);

  const faltaDados =
    contrato.km_saida == null ||
    (mostraCombustivel && !contrato.combustivel_saida) ||
    (mostraEletrico && !contrato.eletricidade_saida);

  useEffect(() => {
    if (!open) return;
    setKmStr(contrato.km_saida != null ? String(contrato.km_saida) : '');
    setCombustivel(contrato.combustivel_saida ?? '');
    setEletricidade(contrato.eletricidade_saida ?? '');
  }, [open, contrato.km_saida, contrato.combustivel_saida, contrato.eletricidade_saida]);

  if (!contrato.entrega_via_any_rent || !faltaDados) return null;

  const kmValido = kmStr.trim() !== '' && Number.isFinite(Number(kmStr));
  const combustivelValido = !mostraCombustivel || combustivel !== '';
  const eletricoValido = !mostraEletrico || eletricidade !== '';
  const podeGuardar = kmValido && combustivelValido && eletricoValido;

  async function handleGuardar() {
    await preencherMut.mutateAsync({
      contratoId: contrato.id,
      kmSaida: Math.round(Number(kmStr)),
      combustivelSaida: mostraCombustivel ? combustivel : null,
      eletricidadeSaida: mostraEletrico ? eletricidade : null,
    });
    setOpen(false);
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
          <Fuel className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Este contrato foi marcado como entregue via <strong>Any Rent</strong> — faltam os dados
            de saída (km/combustível).
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => setOpen(true)}
        >
          Preencher dados
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => (preencherMut.isPending ? undefined : setOpen(o))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fuel className="h-5 w-5 text-primary" /> Dados de saída (Any Rent)
            </DialogTitle>
            <DialogDescription>
              Preenche o km e o combustível/bateria de saída que faltam por este contrato ter sido
              marcado como entregue via Any Rent, sem passar pelo check-in.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="any-rent-km">
                KM de saída <span className="text-destructive">*</span>
              </Label>
              <Input
                id="any-rent-km"
                type="number"
                inputMode="numeric"
                value={kmStr}
                onChange={(e) => setKmStr(e.target.value)}
                placeholder="Ex: 45120"
              />
            </div>

            {mostraCombustivel && (
              <div className="space-y-2">
                <Label>
                  Combustível <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {COMBUSTIVEL_NIVEL_OPTS.map((nivel) => (
                    <button
                      key={nivel}
                      type="button"
                      onClick={() => setCombustivel(nivel)}
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
            )}

            {mostraEletrico && (
              <div className="space-y-2">
                <Label>
                  Nível da bateria <span className="text-destructive">*</span>
                </Label>
                <NivelBateriaInput valor={eletricidade} onChange={setEletricidade} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={preencherMut.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleGuardar} disabled={!podeGuardar || preencherMut.isPending}>
              {preencherMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
