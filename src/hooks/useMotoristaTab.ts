import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { tabActivo, urlDoTab, type MotoristaTab } from '@/components/motorista-portal/motoristaNav';

/**
 * Secção activa do painel do motorista e a forma de mudar de secção.
 *
 * Navega sempre para o painel, mesmo a partir de sub-páginas (detalhe de um
 * acordo): é isso que faz a sidebar e a barra inferior servirem de "voltar".
 */
export function useMotoristaTab() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  const tab = tabActivo(pathname, search);
  const irPara = useCallback((destino: MotoristaTab) => navigate(urlDoTab(destino)), [navigate]);

  return { tab, irPara };
}
