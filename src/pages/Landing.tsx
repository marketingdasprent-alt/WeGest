import { Loader2 } from 'lucide-react';
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated';
import { BackgroundField } from '@/components/site/BackgroundField';
import { LandingHero } from '@/components/site/LandingHero';
import { LandingFeatures } from '@/components/site/LandingFeatures';
import { LandingModulos } from '@/components/site/LandingModulos';
import { LandingCTA } from '@/components/site/LandingCTA';
import { LandingFooter } from '@/components/site/LandingFooter';

const Landing = () => {
  const { loading, isAuthenticated } = useRedirectIfAuthenticated();

  if (loading) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="dark relative bg-background text-foreground">
      <BackgroundField />
      <LandingHero />
      <LandingFeatures />
      <LandingModulos />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
};

export default Landing;
