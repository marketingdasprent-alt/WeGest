import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PlayCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useExecutarAutomacoesManualmente } from '@/hooks/useAutomationQueue';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

// Espelha o rate limit do servidor (5 min) — só para feedback imediato;
// a única fonte de verdade é a RPC, que bloqueia mesmo do lado do servidor.
const RATE_LIMIT_MS = 5 * 60 * 1000;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function CorrerAgoraButton() {
  const { toast } = useToast();
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.AUTOMACOES);
  const executar = useExecutarAutomacoesManualmente();
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (cooldownEnd === null) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [cooldownEnd]);

  const emCooldown = cooldownEnd !== null && nowTick < cooldownEnd;

  const handleClick = async () => {
    try {
      await executar.mutateAsync();
      setCooldownEnd(Date.now() + RATE_LIMIT_MS);
      toast({
        title: 'Automações executadas',
        description: 'Scans de expirações/renovações/cobranças e o motor de regras correram agora.',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível correr',
        description: error instanceof Error ? error.message : 'Erro desconhecido.',
        variant: 'destructive',
      });
    }
  };

  if (!podeGerir) return null;

  return (
    <Button onClick={handleClick} disabled={executar.isPending || emCooldown} size="sm">
      <PlayCircle className={`h-4 w-4 mr-1.5 ${executar.isPending ? 'animate-spin' : ''}`} />
      {executar.isPending
        ? 'A correr…'
        : emCooldown
          ? `Aguarda ${formatCountdown(cooldownEnd - nowTick)}`
          : 'Correr agora'}
    </Button>
  );
}
