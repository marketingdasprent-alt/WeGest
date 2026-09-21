import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { buildSupabaseFunctionUrl } from '@/utils/supabaseFunctionUrl';

/**
 * `wegest.pt/r/<codigo>` — a ponta curta de um link para um ficheiro privado.
 *
 * Esta página não decide nada: entrega o código à edge function `link-curto`,
 * que é quem sabe para onde ele aponta e quem assina o ficheiro na hora. O
 * `replace` é de propósito — quem vier aqui parar e carregar em "voltar" deve
 * sair para a página anterior, não ficar preso num ciclo de redireccionamentos.
 */
export default function LinkCurto() {
  const { codigo } = useParams<{ codigo: string }>();

  useEffect(() => {
    if (!codigo) return;
    window.location.replace(buildSupabaseFunctionUrl('link-curto', { c: codigo }));
  }, [codigo]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <p className="text-sm text-muted-foreground">A abrir o ficheiro…</p>
    </div>
  );
}
