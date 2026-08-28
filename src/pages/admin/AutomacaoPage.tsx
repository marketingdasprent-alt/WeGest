import { useState } from 'react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot } from 'lucide-react';
import { RegrasTab } from '@/components/admin/automacao/RegrasTab';
import { MonitorizacaoView } from '@/components/admin/automacao/monitorizacao/MonitorizacaoView';
import { EditorAutomacaoProvider } from '@/components/admin/automacao/builder/EditorAutomacaoProvider';
import { BarraAccoes } from '@/components/admin/automacao/builder/BarraAccoes';

/**
 * Duas vistas, uma barra.
 *
 * As acções do editor vivem na MESMA linha das tabs — antes havia três
 * cabeçalhos empilhados (título da página, tabs, e um terceiro "Construtor de
 * automações") que comiam a altura útil toda. O terceiro desapareceu: a tab já
 * diz em que contexto se está.
 *
 * "Correr agora" saiu daqui. Não dispara a automação aberta: chama
 * `executar_jobs_automacao_manualmente`, que corre TODOS os scans e o motor de
 * regras inteiro, com rate limit de 5 minutos no servidor. É uma acção de
 * operação, não de edição — passou para Monitorização.
 */
function Conteudo() {
  const [tab, setTab] = useState('editor');

  return (
    // `min-h-0` em toda a cadeia: sem isto o filho de altura calculada estica o
    // pai e aparece a barra de scroll da página por cima da do canvas.
    <div className="flex h-full min-h-0 flex-col gap-4">
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
