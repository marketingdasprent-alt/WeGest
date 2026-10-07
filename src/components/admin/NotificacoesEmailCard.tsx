import { Mail, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

import type { EmailExterno } from '@/hooks/useNotificacaoEmailsExternos';
import type { GrupoDeTipos } from '@/utils/emailsExternosNotificacao';

interface NotificacoesEmailCardProps {
  email: EmailExterno;
  grupos: GrupoDeTipos[];
  onAlternarTipo: (tipo: string, ligado: boolean) => void;
  onAtivar: (ativo: boolean) => void;
  onRemover: () => void;
}

export const NotificacoesEmailCard: React.FC<NotificacoesEmailCardProps> = ({
  email,
  grupos,
  onAlternarTipo,
  onAtivar,
  onRemover,
}) => {
  const subscritos = new Set(email.tipos);

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="font-medium truncate">{email.email}</p>
            {email.nome && <p className="text-xs text-muted-foreground truncate">{email.nome}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {email.ativo ? 'Ativo' : 'Inativo'}
            <Switch checked={email.ativo} onCheckedChange={onAtivar} aria-label="Ativo" />
          </label>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onRemover}
            aria-label={`Remover ${email.email}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {grupos.map((grupo) => (
          <div key={grupo.modulo} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {grupo.modulo}
            </p>
            {grupo.tipos.map((tipo) => {
              const id = `${email.id}-${tipo.eventType}`;
              return (
                <div key={tipo.eventType} className="flex items-start gap-2">
                  <Checkbox
                    id={id}
                    checked={subscritos.has(tipo.eventType)}
                    disabled={!tipo.temAccaoEmail || !email.ativo}
                    onCheckedChange={(v) => onAlternarTipo(tipo.eventType, v === true)}
                  />
                  <label htmlFor={id} className="text-sm leading-tight cursor-pointer">
                    {tipo.label}
                    {!tipo.temAccaoEmail && (
                      <span className="block text-[11px] text-muted-foreground">
                        Sem acção de email no editor de Automação
                      </span>
                    )}
                  </label>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
