import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

declare global {
  interface Window {
    dataLayer?: any[];
  }
}

// Um token_hash ainda válido (links de confirmação e recuperação) não pode ir
// para o GTM/GA: quem lesse o relatório conseguia gastá-lo e entrar na conta.
export const urlSemToken = (href: string): string => {
  const url = new URL(href);
  if (!url.searchParams.has('token_hash')) return href;
  url.search = '';
  url.hash = '';
  return url.toString();
};

export const usePageTracking = () => {
  const location = useLocation();

  useEffect(() => {
    // Ensure dataLayer exists
    if (typeof window !== 'undefined') {
      window.dataLayer = window.dataLayer || [];
      const pageLocation = urlSemToken(window.location.href);

      // Push page_view event
      window.dataLayer.push({
        event: 'page_view',
        page_title: document.title,
        page_location: pageLocation,
        page_path: location.pathname,
      });

      if (import.meta.env.DEV) {
        console.info('[GTM] Page view tracked:', {
          page_title: document.title,
          page_location: pageLocation,
          page_path: location.pathname,
        });
      }
    }
  }, [location]);
};
