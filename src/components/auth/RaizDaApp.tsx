import React from 'react';
import { Navigate } from 'react-router-dom';

import { estaInstaladoComoApp } from '@/lib/pwa';
import { ROTA_PAINEL } from '@/components/motorista-portal/motoristaNav';

interface RaizDaAppProps {
  /** O que a raiz mostra no browser (landing, tickets, ...). */
  children: React.ReactNode;
}

/**
 * A raiz `/` quando a app está INSTALADA vai para o painel do motorista.
 *
 * O `start_url` do manifest já diz `/motorista/painel`, mas o manifest vive
 * na cache do service worker de quem já tinha a app: até o SW novo activar e
 * o Chrome reler o manifest (que ele só faz de longe a longe), a app continua
 * a arrancar em `/` — e `/` é a landing de marketing. Aqui a própria app
 * corrige o destino, seja qual for o `start_url` que o telemóvel ainda tenha.
 *
 * No browser normal nada muda: `/` é o que sempre foi.
 */
export const RaizDaApp: React.FC<RaizDaAppProps> = ({ children }) =>
  estaInstaladoComoApp() ? <Navigate to={ROTA_PAINEL} replace /> : <>{children}</>;
