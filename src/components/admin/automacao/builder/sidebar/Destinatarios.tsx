import { Mail, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  useCargosDisponiveis,
  useUtilizadoresPorCargo,
} from '@/hooks/automacao/useAutomationRulesConfig';
import { Campo, Seccao } from './CamposDoPasso';

/**
 * Quem recebe e por onde.
 *
 * Absorveu a Sheet separada que existia antes: ter dois ecrãs a escrever os
 * mesmos campos era a duplicação que este redesenho veio eliminar.
 */
export function Destinatarios({
  noId,
  dados,
  onAlterar,
}: {
  noId: string;
  dados: Record<string, unknown>;
  onAlterar: (alteracao: Record<string, unknown>) => void;
}) {
  const { data: cargos = [] } = useCargosDisponiveis();
  const escolhidos = (dados.cargoIds as string[]) ?? [];
  const userIds = (dados.userIds as string[]) ?? [];
  const individual = dados.modo === 'individual';
  // Só faz sentido escolher pessoas DENTRO dos cargos já marcados.
  const { data: pessoas = [] } = useUtilizadoresPorCargo(escolhidos);

  const alternarCargo = (id: string) =>
    onAlterar({
      cargoIds: escolhidos.includes(id) ? escolhidos.filter((c) => c !== id) : [...escolhidos, id],
    });

  return (
    <>
      <Seccao titulo="Canal">
        <div className="flex items-center justify-between gap-3">
          {/* A notificação na aplicação é sempre criada pelo motor — é um
              estado, não um interruptor. */}
          <Badge variant="secondary">Na aplicação</Badge>
          <div className="flex items-center gap-2">
            <Label htmlFor={`email-${noId}`} className="flex items-center gap-1.5 text-xs">
              <Mail className="h-3.5 w-3.5" />
              Email
            </Label>
            <Switch
              id={`email-${noId}`}
              checked={Boolean(dados.enviarEmail)}
              onCheckedChange={(v) => onAlterar({ enviarEmail: v })}
            />
          </div>
        </div>
      </Seccao>

      <Seccao titulo="Destinatários">
        <Campo label="Grupos que recebem">
          <div className="flex flex-wrap gap-1.5">
            {escolhidos.map((id) => {
              const nome = cargos.find((c) => c.id === id)?.nome ?? id;
              return (
                <Badge key={id} variant="secondary" className="gap-1 pr-1">
                  {nome}
                  <button
                    type="button"
                    aria-label={`Remover ${nome}`}
                    onClick={() => alternarCargo(id)}
                    className="rounded-full p-0.5 transition-colors hover:bg-background/60"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
            {escolhidos.length === 0 && (
              <span className="text-xs text-muted-foreground">Ninguém escolhido</span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {cargos
              .filter((c) => !escolhidos.includes(c.id))
              .map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] font-normal"
                  onClick={() => alternarCargo(c.id)}
                >
                  + {c.nome}
                </Button>
              ))}
          </div>
        </Campo>

        {escolhidos.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`individual-${noId}`} className="text-xs">
                Escolher pessoas específicas
              </Label>
              <Switch
                id={`individual-${noId}`}
                checked={individual}
                onCheckedChange={(v) =>
                  onAlterar({ modo: v ? 'individual' : 'grupo', userIds: v ? userIds : [] })
                }
              />
            </div>

            {individual && (
              <>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Em vez de todos os utilizadores destes grupos, recebe só quem estiver marcado.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pessoas.map((u) => {
                    const marcado = userIds.includes(u.id);
                    return (
                      <Button
                        key={u.id}
                        size="sm"
                        variant={marcado ? 'secondary' : 'outline'}
                        className="h-6 px-2 text-[11px] font-normal"
                        onClick={() =>
                          onAlterar({
                            userIds: marcado
                              ? userIds.filter((x) => x !== u.id)
                              : [...userIds, u.id],
                          })
                        }
                      >
                        {u.nome}
                      </Button>
                    );
                  })}
                  {pessoas.length === 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      Nenhum utilizador nestes grupos.
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Seccao>
    </>
  );
}
