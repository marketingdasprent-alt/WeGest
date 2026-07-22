import { Link } from 'react-router-dom';
import { ModuleHeader } from '../ModuleHeader';

export const TourSobrePanel = () => (
  <div className="flex h-full flex-col overflow-y-auto">
    <ModuleHeader title="Sobre a WeGest" subtitle="Quem construiu o sistema que acabou de percorrer." />

    <div className="flex-1 space-y-4 px-8 py-6 text-sm text-muted-foreground">
      <p>
        Construímos o WeGest a gerir a nossa própria frota TVDE e rent-a-car — os ecrãs que viu neste
        tour são os mesmos que a nossa equipa usa todos os dias, não uma maquete feita para vender.
      </p>
      <p>
        Só depois de o sistema aguentar a nossa própria operação — contratos, motoristas, viaturas,
        assistência — é que começámos a disponibilizá-lo a outras empresas do sector.
      </p>
      <Link to="/sobre" className="inline-block font-medium text-primary hover:text-primary/80">
        Ler a história completa →
      </Link>
    </div>
  </div>
);
