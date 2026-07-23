import { LandingContact } from '@/components/site/LandingContact';

// Idem: contacto vive como última "tab" do tour, não como secção separada.
export const TourContactPanel = () => (
  <div className="h-full overflow-y-auto">
    <LandingContact />
  </div>
);
