import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Users, Upload, PenTool, BarChart3 } from 'lucide-react';
import { CampanhasTab } from '@/components/marketing/CampanhasTab';
import { ListasTab } from '@/components/marketing/ListasTab';
import { ImportarTab } from '@/components/marketing/ImportarTab';
import { AssinaturasTab } from '@/components/marketing/AssinaturasTab';
import { EstatisticasTab } from '@/components/marketing/EstatisticasTab';

import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Megaphone } from 'lucide-react';
import { useEnsureListaMotoristas } from '@/hooks/useEnsureListaMotoristas';

const Marketing = () => {
  const [activeTab, setActiveTab] = useState('campanhas');
  const queryClient = useQueryClient();
  const { isSuccess: listaPronta } = useEnsureListaMotoristas();

  useEffect(() => {
    if (listaPronta) {
      queryClient.invalidateQueries({ queryKey: ['marketing-listas-with-count'] });
      queryClient.invalidateQueries({ queryKey: ['marketing-listas-envio'] });
    }
  }, [listaPronta, queryClient]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <StickyPageHeader
        title="Marketing"
        description="Gerir campanhas de email, listas de transmissão e importações"
        icon={Megaphone}
        className="pb-0"
      >
        <TabsList className="bg-transparent border-b rounded-none h-auto p-0 gap-6">
          <TabsTrigger
            value="campanhas"
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto gap-2 text-xs"
          >
            <Mail className="h-4 w-4" />
            Campanhas
          </TabsTrigger>
          <TabsTrigger
            value="listas"
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto gap-2 text-xs"
          >
            <Users className="h-4 w-4" />
            Listas
          </TabsTrigger>
          <TabsTrigger
            value="assinaturas"
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto gap-2 text-xs"
          >
            <PenTool className="h-4 w-4" />
            Assinaturas
          </TabsTrigger>
          <TabsTrigger
            value="estatisticas"
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto gap-2 text-xs"
          >
            <BarChart3 className="h-4 w-4" />
            Estatísticas
          </TabsTrigger>
          <TabsTrigger
            value="importar"
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto gap-2 text-xs"
          >
            <Upload className="h-4 w-4" />
            Importar
          </TabsTrigger>
        </TabsList>
      </StickyPageHeader>

      <div className="space-y-6">
        <TabsContent value="campanhas" className="mt-4">
          <CampanhasTab />
        </TabsContent>
        <TabsContent value="listas" className="mt-4">
          <ListasTab />
        </TabsContent>
        <TabsContent value="assinaturas" className="mt-4">
          <AssinaturasTab />
        </TabsContent>
        <TabsContent value="estatisticas" className="mt-4">
          <EstatisticasTab />
        </TabsContent>
        <TabsContent value="importar" className="mt-4">
          <ImportarTab />
        </TabsContent>
      </div>
    </Tabs>
  );
};

export default Marketing;
