import { useState } from 'react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot } from 'lucide-react';
import { RegrasTab } from '@/components/admin/automacao/RegrasTab';
import { MonitorizacaoView } from '@/components/admin/automacao/monitorizacao/MonitorizacaoView';
import { EditorAutomacaoProvider } from '@/components/admin/automacao/builder/EditorAutomacaoProvider';
import { BarraAccoes } from '@/components/admin/automacao/builder/BarraAccoes';

function Conteudo() {
  const [tab, setTab] = useState('editor');

  return (
    // `fullBleed` define a altura do canvas e remove o espaçamento padrão;
    // esta cadeia evita scroll duplo e restitui as margens do conteúdo.
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1920px] flex-col gap-4 p-4 md:p-8">
      <StickyPageHeader
        title="Automação"
        description="Estado, saúde e controlo do motor de automações do WeGest."
        icon={Bot}
      />

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="editor">Editor visual</TabsTrigger>
            <TabsTrigger value="monitorizacao">Monitorização</TabsTrigger>
          </TabsList>

          {tab === 'editor' && (
            <div className="flex flex-wrap items-center gap-2">
              <BarraAccoes />
            </div>
          )}
        </div>

        <TabsContent value="editor" className="mt-0 min-h-0 flex-1">
          <RegrasTab />
        </TabsContent>
        <TabsContent value="monitorizacao" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          <MonitorizacaoView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AutomacaoPage() {
  return (
    <EditorAutomacaoProvider>
      <Conteudo />
    </EditorAutomacaoProvider>
  );
}
