import { useMemo, useState } from 'react';
import { Loader2, Mail, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NotificacoesEmailCard } from '@/components/admin/NotificacoesEmailCard';
import { useAutomationCatalogo } from '@/hooks/automacao/useAutomationCatalogo';
import {
  useAlternarTipoEmailExterno,
  useAtualizarEmailExterno,
  useCriarEmailExterno,
  useEventosComAccaoEmail,
  useNotificacaoEmailsExternos,
} from '@/hooks/useNotificacaoEmailsExternos';
import {
  agruparTiposPorModulo,
  emailValido,
  normalizarEmail,
} from '@/utils/emailsExternosNotificacao';

export function NotificacoesTab() {
  const [novoEmail, setNovoEmail] = useState('');
  const [novoNome, setNovoNome] = useState('');

  const { data: emails = [], isLoading, error } = useNotificacaoEmailsExternos();
  const { data: catalogo } = useAutomationCatalogo();
  const { data: eventosComEmail } = useEventosComAccaoEmail();
  const criar = useCriarEmailExterno();
  const atualizar = useAtualizarEmailExterno();
  const alternarTipo = useAlternarTipoEmailExterno();

  const grupos = useMemo(
    () => agruparTiposPorModulo(catalogo?.eventos ?? {}, eventosComEmail ?? new Set()),
    [catalogo, eventosComEmail]
  );

  const podeAcrescentar = emailValido(novoEmail) && !criar.isPending;

  const handleAcrescentar = () => {
    if (!podeAcrescentar) return;
    criar.mutate(
      { email: normalizarEmail(novoEmail), nome: novoNome.trim() || null },
      {
        onSuccess: () => {
          setNovoEmail('');
          setNovoNome('');
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Emails de notificação</h3>
        <p className="text-sm text-muted-foreground">
          Endereços que recebem avisos por email, mesmo sem conta na WeGest. Para cada email,
          escolhe os tipos. Os avisos com resumo diário chegam num só email às 9h.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={novoEmail}
          onChange={(e) => setNovoEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            handleAcrescentar();
          }}
          placeholder="contabilidade@empresa.pt"
          aria-label="Email"
          className="sm:max-w-xs"
        />
        <Input
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          placeholder="Nome (opcional)"
          aria-label="Nome"
          className="sm:max-w-xs"
        />
        <Button onClick={handleAcrescentar} disabled={!podeAcrescentar} className="gap-2">
          {criar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Acrescentar
        </Button>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : error ? (
        <p className="text-sm text-destructive">Erro: {error.message}</p>
      ) : emails.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Ainda não há emails registados.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {emails.map((email) => (
            <NotificacoesEmailCard
              key={email.id}
              email={email}
              grupos={grupos}
              onAlternarTipo={(tipo, ligado) =>
                alternarTipo.mutate({ emailId: email.id, tipo, ligado })
              }
              onAtivar={(ativo) => atualizar.mutate({ id: email.id, ativo })}
              onRemover={() => atualizar.mutate({ id: email.id, remover: true })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
