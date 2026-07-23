import { Link } from 'react-router-dom';
import { ModuleHeader } from '../ModuleHeader';

export const TourTermosPanel = () => (
  <div className="flex h-full flex-col overflow-y-auto">
    <ModuleHeader
      title="Termos e Condições"
      subtitle="Resumo — texto legal completo na página dedicada."
    />

    <div className="flex-1 space-y-4 px-8 py-6 text-sm text-muted-foreground">
      <p>
        A utilização do WeGest pela sua organização rege-se por um contrato de subscrição: acesso
        aos módulos ativados, dados isolados por organização, e suporte incluído.
      </p>
      <p>
        A sua organização mantém a propriedade de todos os dados introduzidos no sistema —
        contratos, motoristas, viaturas — a qualquer momento, com direito de exportação e
        eliminação.
      </p>
      <Link to="/termos" className="inline-block font-medium text-primary hover:text-primary/80">
        Ver termos completos →
      </Link>
    </div>
  </div>
);
