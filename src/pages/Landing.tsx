import { useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useRedirectIfAuthenticated } from '@/hooks/useRedirectIfAuthenticated';
import { BackgroundField } from '@/components/site/BackgroundField';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { HeroSection } from '@/components/site/sections/HeroSection';
import { ReconhecimentoSection } from '@/components/site/sections/ReconhecimentoSection';
import { CustoSection } from '@/components/site/sections/CustoSection';
import { MudancaSection } from '@/components/site/sections/MudancaSection';
import { ComoFuncionaSection } from '@/components/site/sections/ComoFuncionaSection';
import { DemoSection } from '@/components/site/sections/DemoSection';
import { AutomacoesSection } from '@/components/site/sections/AutomacoesSection';
import { ProvaSection } from '@/components/site/sections/ProvaSection';
import { ObjecoesSection } from '@/components/site/sections/ObjecoesSection';
import { CtaFinalSection } from '@/components/site/sections/CtaFinalSection';

/**
 * Landing pública.
 *
 * A ordem das secções é o produto desta página: dor → custo → mudança →
 * solução → produto → automações → prova → objeções → pedido. Vender
 * funcionalidades antes de existir consciência do problema produz "é bonito",
 * que não é "preciso disto".
 *
 * A página compõe e não faz mais nada — todo o conteúdo vive em
 * `components/site/content/landingContent.ts`.
 */
const Landing = () => {
  const { loading, isAuthenticated } = useRedirectIfAuthenticated();
  const contactoRef = useRef<HTMLDivElement>(null);

  // Um único caminho para o formulário, partilhado por todos os CTA. Scroll
  // nativo com `scroll-margin` nas secções — sem sequestrar a roda do rato,
  // sem alterar o histórico.
  const irParaContacto = useCallback(() => {
    contactoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-label="A carregar" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div id="topo" className="relative bg-background font-body text-foreground">
      <BackgroundField />
      <SiteNav onCtaClick={irParaContacto} />

      <main>
        <HeroSection onCtaClick={irParaContacto} />
        <ReconhecimentoSection />
        <CustoSection />
        <MudancaSection />
        <ComoFuncionaSection />
        <DemoSection onCtaClick={irParaContacto} />
        <AutomacoesSection />
        <ProvaSection />
        <ObjecoesSection />
        <CtaFinalSection ref={contactoRef} />
      </main>

      <SiteFooter />
    </div>
  );
};

export default Landing;
