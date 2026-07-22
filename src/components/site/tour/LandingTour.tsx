import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useSimplifiedMotion } from '@/hooks/useSimplifiedMotion';
import { TourSidebar } from './TourSidebar';
import { TourNavigationProvider } from './TourNavigationContext';
import { TOUR_MODULES, CONTACT_INDEX } from './tourData';
import { AnimatedDashboard } from './panels/AnimatedDashboard';
import { AnimatedRenting } from './panels/AnimatedRenting';
import { AnimatedFrota } from './panels/AnimatedFrota';
import { AnimatedMotoristas } from './panels/AnimatedMotoristas';
import { AnimatedMovimentacoes } from './panels/AnimatedMovimentacoes';
import { AnimatedAssistencia } from './panels/AnimatedAssistencia';
import { AnimatedCRM } from './panels/AnimatedCRM';
import { AnimatedMarketing } from './panels/AnimatedMarketing';
import { AnimatedMaisModulos } from './panels/AnimatedMaisModulos';
import { TourFAQPanel } from './panels/TourFAQPanel';
import { TourContactPanel } from './panels/TourContactPanel';
import { TourSobrePanel } from './panels/TourSobrePanel';
import { TourTermosPanel } from './panels/TourTermosPanel';
import { TourPrivacidadePanel } from './panels/TourPrivacidadePanel';

const PANELS = [
  AnimatedDashboard,
  AnimatedRenting,
  AnimatedFrota,
  AnimatedMotoristas,
  AnimatedMovimentacoes,
  AnimatedAssistencia,
  AnimatedCRM,
  AnimatedMarketing,
  AnimatedMaisModulos,
  TourFAQPanel,
  TourContactPanel,
  TourSobrePanel,
  TourTermosPanel,
  TourPrivacidadePanel,
];

// Só os 10 módulos "principais" (produto + FAQ + Contacto) avançam sozinhos
// ao scroll — Sobre/Termos/Privacidade ficam só a um clique, sem alongar a
// viagem de scroll principal.
const WHEEL_STEPS = TOUR_MODULES.length;
const STEP_LOCK_MS = 420;

interface LandingTourProps {
  /** Índice para saltar direto (ex.: hero "Fale connosco"). null = sem pedido pendente. */
  jumpToIndex?: number | null;
  onJumpHandled?: () => void;
}

// O tour é o coração (e o fim) da landing: a secção enche o viewport depois
// do hero e captura a roda do rato para trocar de "tab" em vez de deixar a
// página avançar — exatamente como usar uma app, não como ler um site.
// Feito à mão (sem GSAP ScrollTrigger/pin) de propósito: o pin-spacer do
// GSAP mostrou-se frágil com scroll real de rato/trackpad; um wheel handler
// direto sobre a própria posição da secção é mais previsível e foi o que já
// tínhamos comprovado a funcionar na versão anterior do tour.
export const LandingTour = ({ jumpToIndex = null, onJumpHandled }: LandingTourProps) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const simplified = useSimplifiedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const lockRef = useRef(false);
  const touchStartY = useRef(0);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (jumpToIndex === null || jumpToIndex === undefined) return;
    activeIndexRef.current = jumpToIndex;
    setActiveIndex(jumpToIndex);
    sectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    onJumpHandled?.();
  }, [jumpToIndex, onJumpHandled]);

  useEffect(() => {
    if (simplified) return;

    // Estrita de propósito: só entra em jogo quando o topo da secção está
    // (quase) alinhado ao topo do viewport, ou seja, quando o scroll normal
    // já encheu o ecrã com o tour. Como esta secção é a última da página e
    // ocupa exatamente 100dvh, o browser nunca deixa fazer scroll "a mais"
    // — top<=0 é sempre o limite máximo de scroll, nunca ultrapassa.
    const isWithinSection = () => {
      const section = sectionRef.current;
      if (!section) return false;
      const rect = section.getBoundingClientRect();
      return rect.top <= 2 && rect.bottom >= window.innerHeight - 2;
    };

    const goTo = (next: number) => {
      const clamped = Math.min(Math.max(next, 0), WHEEL_STEPS - 1);
      if (clamped === activeIndexRef.current) return;
      activeIndexRef.current = clamped;
      setActiveIndex(clamped);
      lockRef.current = true;
      window.setTimeout(() => {
        lockRef.current = false;
      }, STEP_LOCK_MS);
    };

    const step = (goingDown: boolean) => {
      const current = activeIndexRef.current;
      const atEnd = current >= WHEEL_STEPS - 1;
      const atStart = current <= 0;
      if ((goingDown && atEnd) || (!goingDown && atStart)) return false;
      if (!lockRef.current) goTo(current + (goingDown ? 1 : -1));
      return true;
    };

    const handleWheel = (event: WheelEvent) => {
      if (!isWithinSection()) return;
      if (step(event.deltaY > 0)) event.preventDefault();
    };

    const handleTouchStart = (event: TouchEvent) => {
      touchStartY.current = event.touches[0].clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!isWithinSection()) return;
      const touchY = event.touches[0].clientY;
      const delta = touchStartY.current - touchY;
      if (Math.abs(delta) < 32) return;
      if (step(delta > 0)) {
        event.preventDefault();
        touchStartY.current = touchY;
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [simplified]);

  const handleSelect = (index: number) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
  };

  if (simplified) {
    return <SimplifiedTour />;
  }

  const ActivePanel = PANELS[activeIndex];

  return (
    <TourNavigationProvider value={{ goToContact: () => handleSelect(CONTACT_INDEX) }}>
      <section ref={sectionRef} className="relative h-dvh w-full overflow-hidden bg-background">
        <div className="flex h-full w-full">
          <TourSidebar activeIndex={activeIndex} onSelect={handleSelect} />
          <div className="relative flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="absolute inset-0"
              >
                <ActivePanel />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>
    </TourNavigationProvider>
  );
};

// Fallback mobile / reduced-motion: sem captura de scroll, módulos
// empilhados em fluxo normal. Uma barra fina no topo mostra em que módulo
// se está, via IntersectionObserver — mantém a sensação de "tour" sem
// scroll-jacking (mau para touch/acessibilidade).
const SimplifiedTour = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const index = sectionsRef.current.findIndex((el) => el === entry.target);
          if (index !== -1) setActiveIndex(index);
        });
      },
      { threshold: 0.5 }
    );

    sectionsRef.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const ActiveIcon = TOUR_MODULES[activeIndex].icon;
  const goToContact = () =>
    document.getElementById('tab-contacto')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <TourNavigationProvider value={{ goToContact }}>
      <div className="relative">
        <div className="sticky top-0 z-20 flex items-center gap-2 border-y border-border bg-card/80 px-6 py-3 backdrop-blur-md">
          <ActiveIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{TOUR_MODULES[activeIndex].label}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {activeIndex + 1} / {TOUR_MODULES.length}
          </span>
        </div>

        {PANELS.slice(0, WHEEL_STEPS).map((Panel, index) => (
          <div
            key={TOUR_MODULES[index].key}
            id={`tab-${TOUR_MODULES[index].key}`}
            ref={(el) => (sectionsRef.current[index] = el)}
            className="h-[70vh] border-b border-border/60"
          >
            <Panel />
          </div>
        ))}

        <div className="flex flex-col items-center gap-4 border-t border-border/60 px-6 py-10">
          <a
            href="#tab-contacto"
            className="rounded-md bg-primary px-6 py-3 text-center text-base font-medium text-primary-foreground"
          >
            Fale connosco
          </a>
          <Link to="/entrar" className="text-sm font-medium text-primary">
            Já é cliente? Entrar
          </Link>
          <div className="flex flex-wrap justify-center gap-3 pt-2 text-xs text-muted-foreground">
            <Link to="/sobre">Sobre</Link>
            <Link to="/termos">Termos</Link>
            <Link to="/privacidade">Privacidade</Link>
          </div>
        </div>
      </div>
    </TourNavigationProvider>
  );
};
