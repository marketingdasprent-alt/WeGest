import { Loader2 } from 'lucide-react';
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated';
import { BackgroundField } from '@/components/site/BackgroundField';
import { ScrollRail } from '@/components/site/ScrollRail';
import { LandingHero } from '@/components/site/LandingHero';
import { LandingProblema } from '@/components/site/LandingProblema';
import { LandingVirada } from '@/components/site/LandingVirada';
import { LandingContratos } from '@/components/site/LandingContratos';
import { LandingCalendario } from '@/components/site/LandingCalendario';
import { LandingFinanceiro } from '@/components/site/LandingFinanceiro';
import { LandingMultiOrg } from '@/components/site/LandingMultiOrg';
import { LandingModulos } from '@/components/site/LandingModulos';
import { LandingCTA } from '@/components/site/LandingCTA';
import { LandingFooter } from '@/components/site/LandingFooter';

const CHAPTER_LABELS = [
  'Início',
  'O caos',
  'A virada',
  'Contratos',
  'Calendário',
  'Financeiro',
  'Organizações',
  'Módulos',
  'Começar',
];

const Landing = () => {
  const { loading, isAuthenticated } = useRedirectIfAuthenticated();

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
    <div className="relative bg-background">
      <BackgroundField />
      <ScrollRail labels={CHAPTER_LABELS} />
      <LandingHero />
      <LandingProblema />
      <LandingVirada />
      <LandingContratos />
      <LandingCalendario />
      <LandingFinanceiro />
      <LandingMultiOrg />
      <LandingModulos />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
};

export default Landing;
