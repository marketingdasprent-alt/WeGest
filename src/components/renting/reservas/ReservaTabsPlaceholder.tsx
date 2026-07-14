import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ReservaTabsPlaceholderProps {
  /** Tab activa, controlada pelo pai (ex.: para saltar para o separador com erro de validação). */
  value?: string;
  /** Notifica o pai da mudança de tab — omitir mantém o componente não-controlado. */
  onValueChange?: (value: string) => void;
  /** Conteúdo da tab "Geral" — passado pela página pai. Inclui a secção Condutor/Motorista. */
  geralContent: React.ReactNode;
  /** Conteúdo da tab "Coberturas" — passado pela página pai. */
  coberturasContent: React.ReactNode;
  /** Conteúdo da tab "Extras" — passado pela página pai. */
  extrasContent: React.ReactNode;
  /** Conteúdo da tab "Taxas" — passado pela página pai. */
  taxasContent: React.ReactNode;
  /** Conteúdo da tab "Faturar" — só renderizado quando há reserva guardada. */
  faturarContent?: React.ReactNode;
  /** Conteúdo da tab "Histórico" — só renderizado quando há reserva guardada. */
  historicoContent?: React.ReactNode;
  /** Conteúdo da tab "Danos" — danos/fotos do contrato gerado por esta reserva. */
  danosContent?: React.ReactNode;
  /** Conteúdo da tab "Anexos" — passado pela página pai. */
  anexosContent: React.ReactNode;
}

/** Espelha o ContratoTabsPlaceholder — mesma barra de separadores, agora na reserva. */
export const ReservaTabsPlaceholder: React.FC<ReservaTabsPlaceholderProps> = ({
  value,
  onValueChange,
  geralContent,
  coberturasContent,
  extrasContent,
  taxasContent,
  faturarContent,
  historicoContent,
  danosContent,
  anexosContent,
}) => {
  const [activeUncontrolled, setActiveUncontrolled] = useState<string>('geral');
  const active = value ?? activeUncontrolled;
  const setActive = onValueChange ?? setActiveUncontrolled;

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

      <TabsContent value="geral" className="pt-4">
        {geralContent}
      </TabsContent>

      <TabsContent value="coberturas" className="pt-4">
        {coberturasContent}
      </TabsContent>

      <TabsContent value="extras" className="pt-4">
        {extrasContent}
      </TabsContent>

      <TabsContent value="taxas" className="pt-4">
        {taxasContent}
      </TabsContent>

      <TabsContent value="danos" className="pt-4">
        {danosContent}
      </TabsContent>

      {faturarContent && (
        <TabsContent value="faturar" className="pt-4">
          {faturarContent}
        </TabsContent>
      )}

      {historicoContent && (
        <TabsContent value="historico" className="pt-4">
          {historicoContent}
        </TabsContent>
      )}

      <TabsContent value="anexos" className="pt-4">
        {anexosContent}
      </TabsContent>
    </Tabs>
  );
};
