import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy } from 'lucide-react';

interface GeneratedInviteDisplayProps {
  inviteLink: string;
}

export const GeneratedInviteDisplay = ({ inviteLink }: GeneratedInviteDisplayProps) => {
  const { toast } = useToast();

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast({
        title: 'Copiado!',
        description: 'Link copiado para a área de transferência',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao copiar link',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-gray-700/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-white">Link de Convite Gerado</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
            <p className="text-gray-300 text-sm mb-2">Envie este link para a pessoa convidada:</p>
            <p className="text-primary text-sm font-mono break-all">{inviteLink}</p>
          </div>

          <Button
            onClick={copyToClipboard}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white"
          >
            <Copy className="h-4 w-4 mr-2" />
            Copiar Link
          </Button>

          <div className="text-gray-400 text-sm">
            <p>• O convite expira em 7 dias</p>
            <p>• Cada convite pode ser usado apenas uma vez</p>
            <p>• Link: /register?token=...</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
