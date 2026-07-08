import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ContratoTabsPlaceholderProps {
  /** Conteúdo da tab "Geral" — passado pela página pai. Inclui a secção Condutor/Motorista. */
  geralContent: React.ReactNode;
  /** Conteúdo da tab "Coberturas" — passado pela página pai. */
  coberturasContent: React.ReactNode;
  /** Conteúdo da tab "Extras" — passado pela página pai. */
  extrasContent: React.ReactNode;
  /** Conteúdo da tab "Taxas" — passado pela página pai. */
  taxasContent: React.ReactNode;
  /** Conteúdo da tab "Faturar" — só renderizado em modo edit. */
  faturarContent?: React.ReactNode;
  /** Conteúdo da tab "Histórico" — só renderizado em modo edit. */
  historicoContent?: React.ReactNode;
  /** Conteúdo da tab "Danos" — danos/fotos da entrega/recolha deste contrato. */
  danosContent?: React.ReactNode;
  /** Conteúdo da tab "Anexos" — passado pela página pai. */
  anexosContent: React.ReactNode;
}

export const ContratoTabsPlaceholder: React.FC<ContratoTabsPlaceholderProps> = ({
  geralContent,
  coberturasContent,
  extrasContent,
  taxasContent,
  faturarContent,
  historicoContent,
  danosContent,
  anexosContent,
}) => {
  const [active, setActive] = useState<string>('geral');

  return (
    <Tabs value={active} onValueChange={setActive} className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="geral">Geral</TabsTrigger>
        <TabsTrigger value="coberturas">Coberturas</TabsTrigger>
        <TabsTrigger value="extras">Extras</TabsTrigger>
        <TabsTrigger value="taxas">Taxas</TabsTrigger>
        {faturarContent && <TabsTrigger value="faturar">Faturar</TabsTrigger>}
        <TabsTrigger value="danos">Danos</TabsTrigger>
        {historicoContent && <TabsTrigger value="historico">Histórico</TabsTrigger>}
        <TabsTrigger value="anexos">Anexos</TabsTrigger>
      </TabsList>

      <TabsContent value="geral" className="mt-4">
        {geralContent}
      </TabsContent>

      <TabsContent value="coberturas" className="mt-4">
        {coberturasContent}
      </TabsContent>

      <TabsContent value="extras" className="mt-4">
        {extrasContent}
      </TabsContent>

      <TabsContent value="taxas" className="mt-4">
        {taxasContent}
      </TabsContent>

      <TabsContent value="danos" className="mt-4">
        {danosContent}
      </TabsContent>

      {faturarContent && (
        <TabsContent value="faturar" className="mt-4">
          {faturarContent}
        </TabsContent>
      )}

      {historicoContent && (
        <TabsContent value="historico" className="mt-4">
          {historicoContent}
        </TabsContent>
      )}

      <TabsContent value="anexos" className="mt-4">
        {anexosContent}
      </TabsContent>
    </Tabs>
  );
};
