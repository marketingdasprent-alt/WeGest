import { useQuadroToken, useRegenerarQuadroToken } from '@/hooks/useQuadroToken';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function QuadroTvSection() {
  const { data: token, isLoading } = useQuadroToken();
  const regenerar = useRegenerarQuadroToken();

  const link = token ? `${window.location.origin}/quadro/${token}` : null;

  const copiar = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success('Link copiado');
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <h3 className="text-lg font-semibold">Quadro TV</h3>
        <p className="text-sm text-muted-foreground">
          Link só-leitura para mostrar entregas e devoluções numa TV. Não pede login. Regenerar
          invalida o link antigo.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : link ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-sm">{link}</code>
          <Button variant="outline" size="sm" onClick={copiar}>
            Copiar
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Ainda não há link gerado.</p>
      )}

      <Button size="sm" onClick={() => regenerar.mutate()} disabled={regenerar.isPending}>
        {token ? 'Regenerar link' : 'Gerar link'}
      </Button>
    </div>
  );
}
