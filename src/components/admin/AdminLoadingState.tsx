import React from 'react';
import { Shield } from 'lucide-react';

interface AdminLoadingStateProps {
  message: string;
}

// `role="status"` e `aria-live` anunciam a espera a quem não vê o ícone animado.
export const AdminLoadingState = ({ message }: AdminLoadingStateProps) => {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <Shield className="mx-auto mb-4 h-12 w-12 text-primary motion-safe:animate-pulse" />
        <p className="text-lg text-foreground">{message}</p>
      </div>
    </div>
  );
};
