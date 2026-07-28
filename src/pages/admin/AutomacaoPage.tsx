import { useState } from 'react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot } from 'lucide-react';
import { VisaoGeralTab } from '@/components/admin/automacao/VisaoGeralTab';
import { AtividadeTab } from '@/components/admin/automacao/AtividadeTab';
import { FilaTab } from '@/components/admin/automacao/FilaTab';
import { FalhasTab } from '@/components/admin/automacao/FalhasTab';
import { RegrasTab } from '@/components/admin/automacao/RegrasTab';
import { CorrerAgoraButton } from '@/components/admin/automacao/CorrerAgoraButton';

export default function AutomacaoPage() {
  const [tab, setTab] = useState('visao-geral');

  return (
    <div className="space-y-6">
      <StickyPageHeader
        title="Automação"
        description="Estado, saúde e controlo do motor de automações do WeGest."
        icon={Bot}
      >
        <CorrerAgoraButton />
      </StickyPageHeader>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="atividade">Atividade</TabsTrigger>
          <TabsTrigger value="fila">Fila</TabsTrigger>
          <TabsTrigger value="falhas">Falhas</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral">
          <VisaoGeralTab />
        </TabsContent>
        <TabsContent value="atividade">
          <AtividadeTab />
        </TabsContent>
        <TabsContent value="fila">
          <FilaTab />
        </TabsContent>
        <TabsContent value="falhas">
          <FalhasTab />
        </TabsContent>
        <TabsContent value="regras">
          <RegrasTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
