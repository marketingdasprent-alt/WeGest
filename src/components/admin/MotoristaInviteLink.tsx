import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, Car } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';

export const MotoristaInviteLink = () => {
  const { toast } = useToast();
  const { orgId, orgs } = useTenant();

  const codigo = orgs.find((o) => o.id === orgId)?.codigo ?? null;
  const link = codigo ? `${window.location.origin}/motorista/registo?org=${codigo}` : null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Copiado!', description: 'Link de registo de motorista copiado.' });
    } catch {
      toast({ title: 'Erro', description: 'Erro ao copiar link', variant: 'destructive' });
    }
  };

  return (
    <Card className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-gray-700/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Car className="h-5 w-5 text-primary" />
          Link de Registo de Motorista
        </CardTitle>
        <p className="text-gray-400 text-sm">
          Partilhe este link com motoristas para se registarem na sua empresa.
        </p>
      </CardHeader>
      <CardContent>
        {link ? (
          <div className="space-y-4">
            <div className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
              <p className="text-primary text-sm font-mono break-all">{link}</p>
            </div>
            <Button onClick={copy} className="w-full bg-gray-700 hover:bg-gray-600 text-white">
              <Copy className="h-4 w-4 mr-2" />
              Copiar Link
            </Button>
          </div>
        ) : (
          <p className="text-sm text-yellow-400">
            A organização ativa está sem código. Defina o código da empresa nas configurações.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
