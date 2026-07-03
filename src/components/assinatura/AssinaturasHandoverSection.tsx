import { forwardRef, useImperativeHandle, useRef } from 'react';
import { FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SignaturePad, type SignaturePadHandle } from '@/components/assinatura/SignaturePad';

export interface AssinaturasHandoverHandle {
  /** Lê as assinaturas actuais como PNG data URL (null se vazias). */
  getAssinaturas: () => { motorista: string | null; responsavel: string | null };
}

export interface AssinaturasHandoverSectionProps {
  motoristaNome: string;
  responsavelNome: string;
}

export const AssinaturasHandoverSection = forwardRef<
  AssinaturasHandoverHandle,
  AssinaturasHandoverSectionProps
>(({ motoristaNome, responsavelNome }, ref) => {
  const motoristaRef = useRef<SignaturePadHandle>(null);
  const responsavelRef = useRef<SignaturePadHandle>(null);

  useImperativeHandle(ref, () => ({
    getAssinaturas: () => ({
      motorista: motoristaRef.current?.toDataURL() ?? null,
      responsavel: responsavelRef.current?.toDataURL() ?? null,
    }),
  }));

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <FileSignature className="h-4 w-4 text-muted-foreground" />
        Assinaturas
      </h3>
      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Motorista{motoristaNome ? ` — ${motoristaNome}` : ''}</Label>
          <SignaturePad ref={motoristaRef} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => motoristaRef.current?.clear()}
          >
            Limpar
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            Responsável{responsavelNome ? ` — ${responsavelNome}` : ''}
          </Label>
          <SignaturePad ref={responsavelRef} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => responsavelRef.current?.clear()}
          >
            Limpar
          </Button>
        </div>
      </div>
    </section>
  );
});

AssinaturasHandoverSection.displayName = 'AssinaturasHandoverSection';
