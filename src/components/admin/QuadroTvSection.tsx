import { useQuadroToken, useRegenerarQuadroToken } from '@/hooks/useQuadroToken';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, RefreshCw, Tv } from 'lucide-react';
import { toast } from 'sonner';

// Mesma "família" visual dos cartões vizinhos nesta aba (InviteGenerationForm,
// MotoristaInviteLink, GeneratedInviteDisplay) — cartão escuro com gradiente,
// ícone + título, e a caixa de link em fonte monoespaçada.
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
    <Card className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-gray-700/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Tv className="h-5 w-5 text-primary" />
          Quadro TV
        </CardTitle>
        <p className="text-gray-400 text-sm">
          Link só-leitura para mostrar entregas e devoluções numa TV. Não pede login. Regenerar
          invalida o link antigo.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-gray-400">A carregar…</p>
          ) : link ? (
            <div className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
              <p className="text-primary text-sm font-mono break-all">{link}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Ainda não há link gerado.</p>
          )}

          <div className="flex gap-2">
            {link && (
              <Button
                onClick={copiar}
                variant="outline"
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copiar Link
              </Button>
            )}
            <Button
              onClick={() => regenerar.mutate()}
              disabled={regenerar.isPending}
              className={link ? 'flex-1' : 'w-full'}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {token ? 'Regenerar link' : 'Gerar link'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
