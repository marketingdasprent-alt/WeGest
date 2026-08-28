-- Criar tabela de templates de documentos
CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'contrato_tvde',
  empresa_id TEXT NOT NULL,
  template_data JSONB NOT NULL,
  campos_dinamicos JSONB NOT NULL DEFAULT '{"motorista": [], "empresa": [], "contrato": []}'::jsonb,
  ativo BOOLEAN DEFAULT true,
  versao INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  criado_por UUID REFERENCES auth.users(id),
  UNIQUE(empresa_id, tipo, versao)
);

-- Adicionar índices para performance
CREATE INDEX idx_document_templates_empresa_tipo ON public.document_templates(empresa_id, tipo);
CREATE INDEX idx_document_templates_ativo ON public.document_templates(ativo);

-- Enable RLS
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Todos podem ver templates ativos"
  ON public.document_templates
  FOR SELECT
  USING (ativo = true OR is_current_user_admin());

CREATE POLICY "Apenas admins podem criar templates"
  ON public.document_templates
  FOR INSERT
  WITH CHECK (is_current_user_admin());

CREATE POLICY "Apenas admins podem editar templates"
  ON public.document_templates
  FOR UPDATE
  USING (is_current_user_admin());

CREATE POLICY "Apenas admins podem deletar templates"
  ON public.document_templates
  FOR DELETE
  USING (is_current_user_admin());

-- Trigger para atualizar updated_at
CREATE TRIGGER update_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir templates iniciais baseados nos contratos existentes
INSERT INTO public.document_templates (nome, tipo, empresa_id, template_data, campos_dinamicos, ativo, versao) VALUES
(
  'Contrato TVDE - Década Ousada',
  'contrato_tvde',
  'decada_ousada',
  '{
    "titulo": "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE TRANSPORTE DE PASSAGEIROS EM VEÍCULOS DESCARACTERIZADOS A PARTIR DE PLATAFORMA ELETRÓNICA",
    "secoes": [
      {
        "id": "outorgantes",
        "ordem": 1,
        "conteudo": "Entre:\n\nPRIMEIRO OUTORGANTE (O MOTORISTA): {{nome_motorista}}, contribuinte fiscal n.º {{nif_motorista}}, titular do {{documento_tipo}} n.º {{documento_numero}}, válido até {{documento_validade}}, da Carta de Condução n.º {{carta_conducao}} válida até {{carta_validade}}, categorias {{carta_categorias}}, Cartão de Motorista de TVDE n.º {{cmtvde_numero}} válido até {{cmtvde_validade}}, residente em {{morada_motorista}}, com e-mail {{email_motorista}};\n\nE\n\nSEGUNDO OUTORGANTE (A EMPRESA): {{nome_empresa}}, pessoa coletiva n.º {{nif_empresa}}, com sede em {{sede_empresa}}, titular da Licença TVDE n.º {{licenca_tvde}}, válida até {{licenca_validade}}, neste ato representada por {{representante}}, na qualidade de {{cargo_representante}}."
      },
      {
        "id": "clausula_primeira",
        "titulo": "CLÁUSULA PRIMEIRA",
        "subtitulo": "(Objeto do Contrato)",
        "ordem": 2,
        "paragrafos": [
          "1. Pelo presente contrato, o PRIMEIRO OUTORGANTE obriga-se a prestar serviços de transporte de passageiros em veículos descaracterizados a partir de plataforma eletrónica (TVDE), em regime de prestação de serviços independente.",
          "2. Os serviços a prestar pelo PRIMEIRO OUTORGANTE serão realizados através de plataformas eletrónicas autorizadas, em conformidade com a legislação aplicável ao setor TVDE."
        ]
      },
      {
        "id": "clausula_segunda",
        "titulo": "CLÁUSULA SEGUNDA",
        "subtitulo": "(Natureza da Relação)",
        "ordem": 3,
        "paragrafos": [
          "1. O PRIMEIRO OUTORGANTE atuará como prestador de serviços independente, não existindo entre as partes qualquer relação de subordinação jurídica.",
          "2. O PRIMEIRO OUTORGANTE é livre de organizar o seu tempo e método de trabalho, definindo os seus próprios horários de atividade."
        ]
      },
      {
        "id": "clausula_terceira",
        "titulo": "CLÁUSULA TERCEIRA",
        "subtitulo": "(Obrigações do Motorista)",
        "ordem": 4,
        "paragrafos": [
          "1. O PRIMEIRO OUTORGANTE obriga-se a:\na) Manter válidas e atualizadas todas as licenças, certificados e documentação necessária ao exercício da atividade de TVDE;\nb) Prestar os serviços com profissionalismo, cortesia e respeito pelos passageiros;\nc) Manter o veículo em boas condições de higiene, segurança e funcionamento;\nd) Cumprir todas as normas legais e regulamentares aplicáveis à atividade de TVDE;\ne) Respeitar as regras e políticas das plataformas eletrónicas utilizadas."
        ]
      },
      {
        "id": "clausula_quarta",
        "titulo": "CLÁUSULA QUARTA",
        "subtitulo": "(Obrigações da Empresa)",
        "ordem": 5,
        "paragrafos": [
          "1. O SEGUNDO OUTORGANTE obriga-se a:\na) Disponibilizar o acesso às plataformas eletrónicas autorizadas;\nb) Prestar apoio técnico e administrativo necessário ao exercício da atividade;\nc) Processar os pagamentos devidos ao PRIMEIRO OUTORGANTE de acordo com o estabelecido."
        ]
      },
      {
        "id": "clausula_quinta",
        "titulo": "CLÁUSULA QUINTA",
        "subtitulo": "(Remuneração)",
        "ordem": 6,
        "paragrafos": [
          "1. A remuneração do PRIMEIRO OUTORGANTE será calculada com base nos serviços efetivamente prestados, de acordo com as tarifas e condições estabelecidas pelas plataformas eletrónicas.",
          "2. Os valores serão pagos periodicamente, após dedução das taxas e comissões aplicáveis."
        ]
      },
      {
        "id": "clausula_sexta",
        "titulo": "CLÁUSULA SEXTA",
        "subtitulo": "(Duração e Cessação)",
        "ordem": 7,
        "paragrafos": [
          "1. O presente contrato entra em vigor na data de {{data_inicio}} e tem a duração de {{duracao_meses}} meses.",
          "2. Qualquer das partes poderá denunciar o presente contrato mediante comunicação escrita com 30 dias de antecedência.",
          "3. O contrato cessa automaticamente em caso de caducidade ou revogação das licenças necessárias ao exercício da atividade."
        ]
      },
      {
        "id": "clausula_setima",
        "titulo": "CLÁUSULA SÉTIMA",
        "subtitulo": "(Confidencialidade)",
        "ordem": 8,
        "paragrafos": [
          "1. As partes obrigam-se a manter sigilo sobre todas as informações confidenciais a que tenham acesso no âmbito da execução deste contrato."
        ]
      },
      {
        "id": "clausula_oitava",
        "titulo": "CLÁUSULA OITAVA",
        "subtitulo": "(Foro)",
        "ordem": 9,
        "paragrafos": [
          "1. Para resolução de qualquer litígio emergente do presente contrato, as partes elegem o foro de {{cidade_assinatura}}."
        ]
      },
      {
        "id": "assinatura",
        "ordem": 10,
        "conteudo": "Feito em duplicado, em {{cidade_assinatura}}, aos {{data_assinatura}}.\n\n\nO PRIMEIRO OUTORGANTE\n_____________________________\n{{nome_motorista}}\n\n\nO SEGUNDO OUTORGANTE\n_____________________________\n{{representante}}\n{{cargo_representante}}"
      }
    ]
  }'::jsonb,
  '{
    "motorista": ["{{nome_motorista}}", "{{nif_motorista}}", "{{documento_tipo}}", "{{documento_numero}}", "{{documento_validade}}", "{{carta_conducao}}", "{{carta_validade}}", "{{carta_categorias}}", "{{cmtvde_numero}}", "{{cmtvde_validade}}", "{{morada_motorista}}", "{{email_motorista}}"],
    "empresa": ["{{nome_empresa}}", "{{nif_empresa}}", "{{sede_empresa}}", "{{licenca_tvde}}", "{{licenca_validade}}", "{{representante}}", "{{cargo_representante}}"],
    "contrato": ["{{data_inicio}}", "{{data_assinatura}}", "{{cidade_assinatura}}", "{{duracao_meses}}"]
  }'::jsonb,
  true,
  1
);