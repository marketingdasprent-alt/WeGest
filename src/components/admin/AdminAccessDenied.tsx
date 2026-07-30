import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';

/**
 * Ecrã mostrado quando um utilizador sem permissão de administrador abre uma
 * página de administração (AdminSettings, AdminInvites, AdminDocumentos,
 * MinhaOrganizacao).
 *
 * Usa os tokens do tema em vez de cores fixas: antes era
 * `from-gray-900 via-black to-gray-900` com `text-white` e um botão amarelo,
 * o que dava um ecrã preto e fora da paleta a quem usa o tema claro.
 *
 * O ícone leva o vermelho como FUNDO (`bg-destructive`) e não como cor de
 * texto: `text-destructive` sobre o fundo escuro mede 1,92:1, ou seja fica
 * praticamente invisível no tema escuro. Com o vermelho por trás, o símbolo
 * branco lê-se nos dois temas. O significado está no título, em
 * `text-foreground`, e não na cor — nada aqui depende de se distinguir cores.
 */
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
