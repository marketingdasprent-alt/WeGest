import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FaturasPorLiquidarTab } from '@/components/administrativo/por-liquidar/FaturasPorLiquidarTab';

const RentingClientesPorLiquidar = () => {
  const navigate = useNavigate();

  return (
    <div className="w-full">
      <Button
        variant="ghost"
        size="sm"
        className="mb-2"
        onClick={() => navigate('/renting/clientes')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Clientes
      </Button>
      <FaturasPorLiquidarTab />
    </div>
  );
};

export default RentingClientesPorLiquidar;
