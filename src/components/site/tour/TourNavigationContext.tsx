import { createContext, useContext } from 'react';

interface TourNavigation {
  goToContact: () => void;
}

// Só existe para o painel "E muito mais" poder saltar para a tab de
// Contacto sem obrigar todos os outros painéis (que não precisam disto) a
// aceitar uma prop que nunca usam.
const TourNavigationContext = createContext<TourNavigation>({ goToContact: () => {} });

export const TourNavigationProvider = TourNavigationContext.Provider;
export const useTourNavigation = () => useContext(TourNavigationContext);
