import { useEffect, useState, useRef } from 'react';
import { initPixel } from '@/lib/pixel';
import { HeroSection } from './HeroSection';
import { StatsSection } from './StatsSection';
import { AwardsSection } from './AwardsSection';
import { BenefitsSection } from './BenefitsSection';
import { CarCategoriesSection } from './CarCategoriesSection';
import { HowItWorksSection } from './HowItWorksSection';
import { FAQSection } from './FAQSection';
import { CTASection } from './CTASection';
import { Footer } from './Footer';
import { FormModal } from './FormModal';
import { SmartForm } from './SmartForm';
import { motion } from 'framer-motion';

export const DistanciaArrojadaLanding = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'rent' | 'slot' | null>(null);
  const formSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Landing pública → carrega FB Pixel + dispara PageView.
    initPixel();
  }, []);

  const handleRentClick = () => {
    setModalType('rent');
    setIsModalOpen(true);
  };

  const handleSlotClick = () => {
    setModalType('slot');
    setIsModalOpen(true);
  };

  const handleFormClick = () => {
    setModalType(null);
    setIsModalOpen(true);
  };

  const scrollToForm = () => {
    formSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:text-black focus:px-4 focus:py-2 focus:rounded"
      >
        Saltar para o conteúdo
      </a>

      {/* Hero */}
      <HeroSection onRentClick={handleRentClick} onSlotClick={handleSlotClick} />

      <main id="main-content">
        {/* Stats */}
        <StatsSection />

        {/* Awards/Recognition */}
        <AwardsSection />

        {/* Benefits */}
        <BenefitsSection />

        {/* Inline Form Section */}
        <section ref={formSectionRef} className="py-20 bg-black">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <span className="text-red-500 font-semibold text-sm uppercase tracking-wider">
                Candidate-se Agora
              </span>
              <h2 className="text-3xl md:text-5xl font-bold text-white mt-4 mb-6">
                Comece a Faturar Já
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                Preencha o formulário abaixo e a nossa equipa entra em contacto consigo em menos de
                24 horas.
              </p>
            </motion.div>

            <div className="max-w-lg mx-auto">
              <SmartForm />
            </div>
          </div>
        </section>

        {/* Car Categories */}
        <CarCategoriesSection />

        {/* How it works */}
        <HowItWorksSection />

        {/* FAQ */}
        <FAQSection />

        {/* CTA */}
        <CTASection onFormClick={handleFormClick} />
      </main>

      {/* Footer */}
      <Footer />

      {/* Form Modal */}
      <FormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialType={modalType}
      />
    </div>
  );
};
