import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';

// O ícone usa fundo destructive para manter contraste nos dois temas.
export const AdminAccessDenied = () => {
  const navigate = useNavigate();

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background"
      role="alert"
      aria-live="assertive"
    >
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive">
          <Shield className="h-6 w-6 text-destructive-foreground" aria-hidden="true" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-foreground">Acesso restrito</h2>
        <p className="mb-4 text-muted-foreground">Só administradores podem aceder a esta página.</p>
        <Button onClick={() => navigate('/crm')}>Voltar ao CRM</Button>
      </div>
    </div>
  );
};
