import React from 'react';
import { Shield } from 'lucide-react';

interface AdminLoadingStateProps {
  message: string;
}

/**
 * Ecrã de espera enquanto se verificam permissões de administrador.
 *
 * Usa os tokens do tema em vez de cores fixas: antes era
 * `from-gray-900 via-black to-gray-900` com `text-white`, o que dava um ecrã
 * preto a um utilizador em tema claro nas quatro páginas que o mostram
 * (AdminSettings, AdminInvites, AdminDocumentos, MinhaOrganizacao).
 *
 * `role="status"` + `aria-live` para o leitor de ecrã anunciar a espera — sem
 * isto, quem não vê o ícone a pulsar não recebe qualquer indicação de que a
 * página está a carregar.
 */
export const AdminLoadingState = ({ message }: AdminLoadingStateProps) => {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        {/* motion-safe: quem pediu menos movimento no sistema não leva a pulsação. */}
        <Shield className="mx-auto mb-4 h-12 w-12 text-primary motion-safe:animate-pulse" />
        <p className="text-lg text-foreground">{message}</p>
      </div>
    </div>
  );
};
