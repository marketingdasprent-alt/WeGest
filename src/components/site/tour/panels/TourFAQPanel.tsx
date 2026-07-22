import { LandingFAQ } from '@/components/site/LandingFAQ';

// FAQ como "página" do próprio tour — mesma sensação de navegar o sistema,
// não uma secção de marketing à parte.
export const TourFAQPanel = () => (
  <div className="h-full overflow-y-auto">
    <LandingFAQ />
  </div>
);
