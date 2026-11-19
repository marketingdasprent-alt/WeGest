import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  rotulo?: string;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  providerNome: string;
}

/** Chave da API colada pelo utilizador (KeyInvoice e afins), com mostrar/ocultar. */
export function ChaveApiField({
  rotulo,
  apiKey,
  onApiKeyChange,
  showKey,
  onToggleShowKey,
  providerNome,
}: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor="fat-key">
        {rotulo || 'Chave da API'} <span className="text-destructive">*</span>
      </Label>
      <div className="relative">
        <Input
          id="fat-key"
          type={showKey ? 'text' : 'password'}
          placeholder={rotulo ? `Introduza ${rotulo.toLowerCase()}` : 'Cole aqui a chave da API'}
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
          onClick={onToggleShowKey}
        >
          {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Para o {providerNome}, normalmente basta a chave — o resto usa os valores por defeito.
      </p>
    </div>
  );
}
