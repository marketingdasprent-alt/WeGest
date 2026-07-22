import { Link } from 'react-router-dom';
import { ModuleHeader } from '../ModuleHeader';

export const TourPrivacidadePanel = () => (
  <div className="flex h-full flex-col overflow-y-auto">
    <ModuleHeader title="Privacidade" subtitle="Resumo — política completa na página dedicada." />

    <div className="flex-1 space-y-4 px-8 py-6 text-sm text-muted-foreground">
      <p>
        Cada organização tem os seus dados isolados ao nível da base de dados (RLS) — a sua equipa
        nunca vê dados de outra empresa, mesmo partilhando o mesmo sistema.
      </p>
      <p>
        Tratamos dados pessoais de motoristas e clientes conforme o RGPD: apenas para os fins
        contratados, sem partilha com terceiros fora do necessário para prestar o serviço.
      </p>
      <Link to="/privacidade" className="inline-block font-medium text-primary hover:text-primary/80">
        Ver política completa →
      </Link>
    </div>
  </div>
);
