import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated';
import { BackgroundField } from '@/components/site/BackgroundField';
import { LandingHero } from '@/components/site/LandingHero';
import { LandingTour } from '@/components/site/tour/LandingTour';
import { CONTACT_INDEX } from '@/components/site/tour/tourData';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const Landing = () => {
  const { loading, isAuthenticated } = useRedirectIfAuthenticated();
  const [jumpToIndex, setJumpToIndex] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="relative bg-background font-body text-foreground">
      <BackgroundField />
      <div className="fixed right-4 top-4 z-50">
        <ThemeToggle />
      </div>
      <LandingHero
        onContactClick={() => {
          // Desktop: salta a tab ativa do tour (via prop). Mobile (sem essa
          // ref, cada painel já vive no fluxo normal): scroll nativo até ao
          // painel de Contacto pelo id. Um dos dois é sempre um no-op.
          setJumpToIndex(CONTACT_INDEX);
          document.getElementById('tab-contacto')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      <LandingTour jumpToIndex={jumpToIndex} onJumpHandled={() => setJumpToIndex(null)} />
    </div>
  );
};

export default Landing;
