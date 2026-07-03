import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SignaturePad, type SignaturePadHandle } from '@/components/assinatura/SignaturePad';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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

  // Se o utilizador actual (o responsável a assinar) já tiver a assinatura
  // guardada no perfil (Minha Conta), pré-preenche — evita ter de a
  // redesenhar sempre que fecha um contrato/regista uma entrega.
  const { user } = useAuth();
  const { data: assinaturaResponsavelUrl } = useQuery({
    queryKey: ['profile-assinatura', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('assinatura_url')
        .eq('id', user!.id)
        .maybeSingle();
      return data?.assinatura_url ?? null;
    },
  });

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
      <div className="grid w-full min-w-0 grid-cols-1 gap-4">
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
          <SignaturePad ref={responsavelRef} value={assinaturaResponsavelUrl} />
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
