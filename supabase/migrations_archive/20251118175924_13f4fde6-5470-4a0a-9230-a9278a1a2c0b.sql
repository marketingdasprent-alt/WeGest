-- Atualizar template da Década Ousada com texto completo do contrato
UPDATE document_templates
SET 
  template_data = jsonb_build_object(
    'conteudo', 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MOTORISTA INDEPENDENTE EM VEÍCULOS DESCARACTERIZADOS (TVDE)

PRIMEIRO OUTORGANTE: {{motorista_nome}}, com NIF {{motorista_nif}}, titular do {{motorista_documento_tipo}} n.º {{motorista_documento_numero}}, Carta de Condução n.º {{carta_conducao}}, categorias {{carta_categorias}}, com validade até {{carta_validade}} e CMTVDE n.º {{cmtvde_numero}} válido até {{cmtvde_validade}}, com residência na {{motorista_morada}}, com o email {{motorista_email}}, adiante designado(a) como Primeiro Outorgante.

SEGUNDA OUTORGANTE: {{empresa_nome_completo}}, pessoa coletiva nº {{empresa_nif}}, com sede na {{empresa_sede}}, licença de Operador de TVDE nº {{empresa_licenca_tvde}}, válida até {{empresa_licenca_validade}}, representada por {{empresa_representante}}, {{empresa_cargo_representante}}, adiante designada por Segunda Outorgante,

Considerando que:

a) O Primeiro Outorgante se dedica, como trabalhador independente e com carácter lucrativo, à atividade de motorista TVDE; e que,

b) O Primeiro Outorgante possui o certificado de motorista de TVDE emitido pelo IMT, I.P., nos termos do disposto na Lei n.º 45/2018, de 10 de agosto e na Portaria n.º 293/2018, de 31 de outubro,

É livre e de boa-fé celebrado o presente contrato de Prestação de Serviços, ao abrigo do disposto no art.º. 1154 do Código Civil e Lei nº 45/2018, de 10 de agosto, e, especialmente, pelas cláusulas seguintes:

CLÁUSULA PRIMEIRA
(Objeto do Contrato)

1. Pelo presente contrato, a Primeira Outorgante contrata os serviços de motorista TVDE do Segundo Outorgante, de forma independente e autónoma, em regime de prestação de serviços e nos termos do disposto nos artigos 1154º e seguintes do Código Civil, não tendo os Outorgantes a intenção de constituir uma relação de natureza laboral.

2. Os serviços a prestar pelo Primeiro Outorgante, no âmbito do presente contrato, serão concretizados com plena autonomia e sem sujeição a quaisquer ordens ou instruções, sem sujeição a um horário de trabalho, estando apenas sujeitos às regras constantes dos artigos e clausulas seguintes.

CLÁUSULA SEGUNDA
(Das Obrigações do Primeiro Outorgante)

1. O Primeiro Outorgante, obtida que seja a sua conta motorista/TVDE nas Plataformas, realizará a sua prestação de serviços diretamente, não podendo delegar a mesma em terceiros.

2. O Primeiro Outorgante é responsável por disponibilizar os seus dados e cumprir o código de conduta e instruções exigíveis aos motoristas TVDE nas Plataformas em que estiver inscrito.

3. O Primeiro Outorgante deverá respeitar as normas referentes à higiene, organização e cuidado dos veículos e de todos os equipamentos utilizados para a prestação dos serviços ora contratualizada, visando o bom atendimento aos utilizadores da(s) plataforma(s) eletrónica(s) operada(s) pela Segunda Outorgante e utilizadores evitando assim comunicações negativas por parte da(s) referida(s) plataforma(s) e utilizadores.

4. O Primeiro Outorgante deverá respeitar todas as normas de higiene e segurança, nomeadamente todas as regras em vigor ou que venham a ser definidas como proteção à COVID 19.

5. O Primeiro Outorgante obriga-se a manter rigorosamente dentro dos prazos de validade e em conformidade com a legislação vigente toda a documentação e requisitos indispensáveis para o exercício da atividade objeto do presente contrato, especialmente os descritos na alínea (a) a (d), do nº 1 do art.º. 10 da Lei 45/2018, de 10 de agosto.

6. No âmbito da presente prestação de serviços, não é permitido fumar no interior dos veículos, assim como não poderá o Primeiro Outorgante encontrar-se sob efeito de álcool e/ou qualquer outro estupefaciente ou substâncias psicotrópicas descritas nas tabelas I a IV anexas ao Decreto-Lei nº 15/93, de 22 de janeiro, sob pena de responsabilização civil e criminal.

7. O Primeiro Outorgante é responsável por zelar pela efetiva limpeza do veículo que, para a cabal prestação dos serviços em causa, utilizar.

8. O Primeiro Outorgante é responsável por efetuar a participação imediata às Plataformas de objetos que se encontrem perdidos no interior do veículo, utilizando para o efeito a sua aplicação e informando de seguida a Segunda Outorgante.

9. O Primeiro Outorgante é responsável por informar de imediato a Segunda Outorgante de qualquer sinistro em que seja interveniente no âmbito da presente prestação de serviços.

10. O Primeiro Outorgante deverá ter uma condução defensiva, cumprir as regras rodoviárias em vigor.

11. Quaisquer infrações rodoviárias praticadas pelo Primeiro Outorgante durante a execução do presente contrato serão da sua inteira responsabilidade.

12. O Primeiro Outorgante é responsável pelos danos provenientes do risco próprio do veículo sempre que detenha a direção efetiva do mesmo, sem detrimento da obrigação de transferir a responsabilidade inerente aos riscos de utilização do veículo para Seguradora.

CLÁUSULA TERCEIRA
(Organização do Tempo de Trabalho)

1. O período normal de trabalho do Primeiro Outorgante, conforme Decreto-Lei nº 117/2012, de 5 de junho, não poderá ultrapassar as 60 horas semanais e nunca ultrapassando as 48 horas em média num período de quatro meses.

2. O Primeiro Outorgante realizará os turnos que entender, em dias não fixos e de acordo com sua disponibilidade e necessidade, limitados às 10h de prestação do serviço diário.

3. O Primeiro Outorgante realizará intervalo para descanso de, no mínimo, 45 (quarenta e cinco) minutos a, no máximo, 1 (uma) hora. O intervalo para descanso poderá ser dividido em até 3 (três) períodos, com duração de 15 a 20 minutos cada período.

4. O Primeiro Outorgante não realizará períodos de prestação de serviços superiores a 6 (seis) horas consecutivas.

CLÁUSULA QUARTA
(Validade do Contrato e Remuneração)

1. O presente contrato de prestação de serviço iniciará em {{data_inicio}} e terá duração de 12 (doze) meses, sendo automaticamente renovado por igual período caso não exista nenhuma informação em contrário.

2. No final de cada ciclo de 7 dias (de 2ª feira a Domingo), a Segunda Outorgante obriga-se a pagar ao Primeiro Outorgante o montante proporcional a 100% sobre o valor líquido auferido no ciclo de 7 dias deduzido de todos os custos que não sejam responsabilidade da Segunda Outorgante.

3. A Segunda Outorgante deverá apresentar um Relatório do Ciclo, para os fins do que estabelece o nº 2 desta cláusula, até 4 dias úteis após o fim do ciclo respetivo;

4. Sobre os montantes referidos no nº 2 desta cláusula, a Segunda Outorgante efetuará os competentes descontos legais, à taxa legal, a título de retenção na fonte (IRS), quando for o caso;

5. O Primeiro Outorgante é o único e exclusivo responsável pelo cumprimento das determinações legais relativas a normas de segurança do trabalho, bem como pelos pagamentos e contribuições relativos a impostos, segurança social, seguros de acidentes de trabalho ou outras importâncias devidas e inerentes à sua atividade profissional liberal.

6. O pagamento referido no nº 2 só será efetuado após a apresentação por parte do Primeiro Outorgante da fatura-recibo do valor previsto no Relatório do Ciclo.

CLÁUSULA QUINTA
(Da Proteção de Dados)

1. O Primeiro Outorgante declara expressamente que os dados pessoais transmitidos à Segunda Outorgante para efeitos de elaboração e execução do presente contrato são adequados, pertinentes e não excessivos relativamente às finalidades visadas.

2. O Primeiro Outorgante autoriza a Segunda Outorgante a proceder ao tratamento dos dados pessoais ora transmitidos, tratamento esse que a Segunda Outorgante se obriga a efetuar de acordo com o disposto na legislação aplicável em matéria de tratamento de dados pessoais.

3. O Primeiro Outorgante obriga-se a não revelar, em nenhuma circunstância, os dados de natureza pessoal recolhidos ou fornecidos à Segunda Outorgante de que tome conhecimento, seja pelo exercício da presente prestação de serviços, seja por modo inadvertido, sob pena de responder, civil e criminalmente, por qualquer prática indevida que viole os direitos do titular desses dados.

4. A Segunda Outorgante vai conservar os dados do Primeiro Outorgante pelos prazos necessários a dar cumprimento a obrigações legais, designadamente de 10 (dez) anos para cumprimento à obrigação legal de arquivo de toda a documentação de escrita comercial.

5. O Primeiro Outorgante poderá solicitar à Segunda Outorgante e esta, salvo impedimento legal, vai salvaguardar os direitos do Primeiro Outorgante: de acesso aos dados pessoais que lhe digam respeito, bem como a sua retificação ou o seu apagamento, e a limitação do tratamento, e o direito de se opor ao tratamento, bem como do direito à portabilidade dos dados; e ainda o direito de retirar consentimento em qualquer altura, sem comprometer a licitude do tratamento efetuado com base no cumprimento de obrigações legais ou com base no consentimento previamente dado; e também o direito de reclamação sobre o tratamento de dados junto da Comissão Nacional de Proteção de Dados.

6. Tendo em conta as técnicas mais avançadas, os custos de aplicação e a natureza, o âmbito, o contexto e as finalidades do tratamento, bem como os riscos, de probabilidade e gravidade variável, para os direitos e liberdades das pessoas singulares, a Segunda Outorgante aplica as medidas técnicas e organizativas adequadas para assegurar um nível de segurança adequado ao risco, incluindo, consoante o que for adequado.

7. Em caso de violação de dados pessoais a Segunda Outorgante notifica esse facto à Comissão Nacional de Proteção de Dados nos termos e condições previstos na lei. Se essa violação for suscetível de implicar um elevado risco para os direitos e liberdades do titular comunica-lhe esse facto, nos termos e condições previstos na lei.

CLÁUSULA SEXTA
(Caducidade e Denúncia Contratual)

1. O presente contrato poderá ser denunciado por qualquer das partes em qualquer tempo, devendo apenas a parte que o deseja cessar encaminhar comunicação com 30 dias de antecedência, por meio de e-mail e por carta registada, à morada da outra parte.

2. A denúncia do contrato sem observância do prazo de pré-aviso determinado acima, obriga o denunciante ao pagamento de uma indemnização correspondente ao período de pré-aviso em falta, calculando-se o valor com base na média da remuneração auferida pelo Segundo Outorgante nos 6 (seis) meses anteriores à denúncia.

3. O incumprimento das obrigações contratuais legitima a resolução contratual e a consequente indemnização pelos eventuais danos sofridos, nos termos gerais da responsabilidade civil.

FEITO E ASSINADO, em duplicado, na data e local mencionados abaixo, pelas partes aí identificadas e assinadas, ficando um exemplar para cada uma das partes.

{{cidade_assinatura}}, {{data_assinatura}}

Primeiro Outorgante:
_______________________________________________________

Segunda Outorgante:
_______________________________________________________'
  ),
  papel_timbrado_url = '/images/papel-timbrado-decada-ousada.png',
  campos_dinamicos = jsonb_build_object(
    'motorista', jsonb_build_array(
      'motorista_nome', 'motorista_nif', 'motorista_documento_tipo', 'motorista_documento_numero',
      'motorista_morada', 'motorista_email', 'carta_conducao', 'carta_categorias',
      'carta_validade', 'cmtvde_numero', 'cmtvde_validade'
    ),
    'empresa', jsonb_build_array(
      'empresa_nome_completo', 'empresa_nif', 'empresa_sede', 'empresa_licenca_tvde',
      'empresa_licenca_validade', 'empresa_representante', 'empresa_cargo_representante'
    ),
    'contrato', jsonb_build_array('data_inicio', 'cidade_assinatura', 'data_assinatura')
  ),
  updated_at = now()
WHERE empresa_id = 'decada_ousada' AND tipo = 'contrato_tvde';

-- Criar ou atualizar template para Distância Arrojada
INSERT INTO document_templates (
  nome, tipo, empresa_id, template_data, campos_dinamicos, papel_timbrado_url, ativo, versao
)
SELECT 
  'Contrato TVDE - Distância Arrojada',
  'contrato_tvde',
  'distancia_arrojada',
  jsonb_build_object(
    'conteudo', 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MOTORISTA INDEPENDENTE EM VEÍCULOS DESCARACTERIZADOS (TVDE)

PRIMEIRO OUTORGANTE: {{motorista_nome}}, com NIF {{motorista_nif}}, titular do {{motorista_documento_tipo}} n.º {{motorista_documento_numero}}, Carta de Condução n.º {{carta_conducao}}, categorias {{carta_categorias}}, com validade até {{carta_validade}} e CMTVDE n.º {{cmtvde_numero}} válido até {{cmtvde_validade}}, com residência na {{motorista_morada}}, com o email {{motorista_email}}, adiante designado(a) como Primeiro Outorgante.

SEGUNDA OUTORGANTE: {{empresa_nome_completo}}, pessoa coletiva nº {{empresa_nif}}, com sede na {{empresa_sede}}, licença de Operador de TVDE nº {{empresa_licenca_tvde}}, válida até {{empresa_licenca_validade}}, representada por {{empresa_representante}}, {{empresa_cargo_representante}}, adiante designada por Segunda Outorgante,

Considerando que:

a) O Primeiro Outorgante se dedica, como trabalhador independente e com carácter lucrativo, à atividade de motorista TVDE; e que,

b) O Primeiro Outorgante possui o certificado de motorista de TVDE emitido pelo IMT, I.P., nos termos do disposto na Lei n.º 45/2018, de 10 de agosto e na Portaria n.º 293/2018, de 31 de outubro,

É livre e de boa-fé celebrado o presente contrato de Prestação de Serviços, ao abrigo do disposto no art.º. 1154 do Código Civil e Lei nº 45/2018, de 10 de agosto, e, especialmente, pelas cláusulas seguintes:

CLÁUSULA PRIMEIRA
(Objeto do Contrato)

1. Pelo presente contrato, a Primeira Outorgante contrata os serviços de motorista TVDE do Segundo Outorgante, de forma independente e autónoma, em regime de prestação de serviços e nos termos do disposto nos artigos 1154º e seguintes do Código Civil, não tendo os Outorgantes a intenção de constituir uma relação de natureza laboral.

2. Os serviços a prestar pelo Primeiro Outorgante, no âmbito do presente contrato, serão concretizados com plena autonomia e sem sujeição a quaisquer ordens ou instruções, sem sujeição a um horário de trabalho, estando apenas sujeitos às regras constantes dos artigos e clausulas seguintes.

CLÁUSULA SEGUNDA
(Das Obrigações do Primeiro Outorgante)

1. O Primeiro Outorgante, obtida que seja a sua conta motorista/TVDE nas Plataformas, realizará a sua prestação de serviços diretamente, não podendo delegar a mesma em terceiros.

2. O Primeiro Outorgante é responsável por disponibilizar os seus dados e cumprir o código de conduta e instruções exigíveis aos motoristas TVDE nas Plataformas em que estiver inscrito.

3. O Primeiro Outorgante deverá respeitar as normas referentes à higiene, organização e cuidado dos veículos e de todos os equipamentos utilizados para a prestação dos serviços ora contratualizada, visando o bom atendimento aos utilizadores da(s) plataforma(s) eletrónica(s) operada(s) pela Segunda Outorgante e utilizadores evitando assim comunicações negativas por parte da(s) referida(s) plataforma(s) e utilizadores.

4. O Primeiro Outorgante deverá respeitar todas as normas de higiene e segurança, nomeadamente todas as regras em vigor ou que venham a ser definidas como proteção à COVID 19.

5. O Primeiro Outorgante obriga-se a manter rigorosamente dentro dos prazos de validade e em conformidade com a legislação vigente toda a documentação e requisitos indispensáveis para o exercício da atividade objeto do presente contrato, especialmente os descritos na alínea (a) a (d), do nº 1 do art.º. 10 da Lei 45/2018, de 10 de agosto.

6. No âmbito da presente prestação de serviços, não é permitido fumar no interior dos veículos, assim como não poderá o Primeiro Outorgante encontrar-se sob efeito de álcool e/ou qualquer outro estupefaciente ou substâncias psicotrópicas descritas nas tabelas I a IV anexas ao Decreto-Lei nº 15/93, de 22 de janeiro, sob pena de responsabilização civil e criminal.

7. O Primeiro Outorgante é responsável por zelar pela efetiva limpeza do veículo que, para a cabal prestação dos serviços em causa, utilizar.

8. O Primeiro Outorgante é responsável por efetuar a participação imediata às Plataformas de objetos que se encontrem perdidos no interior do veículo, utilizando para o efeito a sua aplicação e informando de seguida a Segunda Outorgante.

9. O Primeiro Outorgante é responsável por informar de imediato a Segunda Outorgante de qualquer sinistro em que seja interveniente no âmbito da presente prestação de serviços.

10. O Primeiro Outorgante deverá ter uma condução defensiva, cumprir as regras rodoviárias em vigor.

11. Quaisquer infrações rodoviárias praticadas pelo Primeiro Outorgante durante a execução do presente contrato serão da sua inteira responsabilidade.

12. O Primeiro Outorgante é responsável pelos danos provenientes do risco próprio do veículo sempre que detenha a direção efetiva do mesmo, sem detrimento da obrigação de transferir a responsabilidade inerente aos riscos de utilização do veículo para Seguradora.

CLÁUSULA TERCEIRA
(Organização do Tempo de Trabalho)

1. O período normal de trabalho do Primeiro Outorgante, conforme Decreto-Lei nº 117/2012, de 5 de junho, não poderá ultrapassar as 60 horas semanais e nunca ultrapassando as 48 horas em média num período de quatro meses.

2. O Primeiro Outorgante realizará os turnos que entender, em dias não fixos e de acordo com sua disponibilidade e necessidade, limitados às 10h de prestação do serviço diário.

3. O Primeiro Outorgante realizará intervalo para descanso de, no mínimo, 45 (quarenta e cinco) minutos a, no máximo, 1 (uma) hora. O intervalo para descanso poderá ser dividido em até 3 (três) períodos, com duração de 15 a 20 minutos cada período.

4. O Primeiro Outorgante não realizará períodos de prestação de serviços superiores a 6 (seis) horas consecutivas.

CLÁUSULA QUARTA
(Validade do Contrato e Remuneração)

1. O presente contrato de prestação de serviço iniciará em {{data_inicio}} e terá duração de 12 (doze) meses, sendo automaticamente renovado por igual período caso não exista nenhuma informação em contrário.

2. No final de cada ciclo de 7 dias (de 2ª feira a Domingo), a Segunda Outorgante obriga-se a pagar ao Primeiro Outorgante o montante proporcional a 100% sobre o valor líquido auferido no ciclo de 7 dias deduzido de todos os custos que não sejam responsabilidade da Segunda Outorgante.

3. A Segunda Outorgante deverá apresentar um Relatório do Ciclo, para os fins do que estabelece o nº 2 desta cláusula, até 4 dias úteis após o fim do ciclo respetivo;

4. Sobre os montantes referidos no nº 2 desta cláusula, a Segunda Outorgante efetuará os competentes descontos legais, à taxa legal, a título de retenção na fonte (IRS), quando for o caso;

5. O Primeiro Outorgante é o único e exclusivo responsável pelo cumprimento das determinações legais relativas a normas de segurança do trabalho, bem como pelos pagamentos e contribuições relativos a impostos, segurança social, seguros de acidentes de trabalho ou outras importâncias devidas e inerentes à sua atividade profissional liberal.

6. O pagamento referido no nº 2 só será efetuado após a apresentação por parte do Primeiro Outorgante da fatura-recibo do valor previsto no Relatório do Ciclo.

CLÁUSULA QUINTA
(Da Proteção de Dados)

1. O Primeiro Outorgante declara expressamente que os dados pessoais transmitidos à Segunda Outorgante para efeitos de elaboração e execução do presente contrato são adequados, pertinentes e não excessivos relativamente às finalidades visadas.

2. O Primeiro Outorgante autoriza a Segunda Outorgante a proceder ao tratamento dos dados pessoais ora transmitidos, tratamento esse que a Segunda Outorgante se obriga a efetuar de acordo com o disposto na legislação aplicável em matéria de tratamento de dados pessoais.

3. O Primeiro Outorgante obriga-se a não revelar, em nenhuma circunstância, os dados de natureza pessoal recolhidos ou fornecidos à Segunda Outorgante de que tome conhecimento, seja pelo exercício da presente prestação de serviços, seja por modo inadvertido, sob pena de responder, civil e criminalmente, por qualquer prática indevida que viole os direitos do titular desses dados.

4. A Segunda Outorgante vai conservar os dados do Primeiro Outorgante pelos prazos necessários a dar cumprimento a obrigações legais, designadamente de 10 (dez) anos para cumprimento à obrigação legal de arquivo de toda a documentação de escrita comercial.

5. O Primeiro Outorgante poderá solicitar à Segunda Outorgante e esta, salvo impedimento legal, vai salvaguardar os direitos do Primeiro Outorgante: de acesso aos dados pessoais que lhe digam respeito, bem como a sua retificação ou o seu apagamento, e a limitação do tratamento, e o direito de se opor ao tratamento, bem como do direito à portabilidade dos dados; e ainda o direito de retirar consentimento em qualquer altura, sem comprometer a licitude do tratamento efetuado com base no cumprimento de obrigações legais ou com base no consentimento previamente dado; e também o direito de reclamação sobre o tratamento de dados junto da Comissão Nacional de Proteção de Dados.

6. Tendo em conta as técnicas mais avançadas, os custos de aplicação e a natureza, o âmbito, o contexto e as finalidades do tratamento, bem como os riscos, de probabilidade e gravidade variável, para os direitos e liberdades das pessoas singulares, a Segunda Outorgante aplica as medidas técnicas e organizativas adequadas para assegurar um nível de segurança adequado ao risco, incluindo, consoante o que for adequado.

7. Em caso de violação de dados pessoais a Segunda Outorgante notifica esse facto à Comissão Nacional de Proteção de Dados nos termos e condições previstos na lei. Se essa violação for suscetível de implicar um elevado risco para os direitos e liberdades do titular comunica-lhe esse facto, nos termos e condições previstos na lei.

CLÁUSULA SEXTA
(Caducidade e Denúncia Contratual)

1. O presente contrato poderá ser denunciado por qualquer das partes em qualquer tempo, devendo apenas a parte que o deseja cessar encaminhar comunicação com 30 dias de antecedência, por meio de e-mail e por carta registada, à morada da outra parte.

2. A denúncia do contrato sem observância do prazo de pré-aviso determinado acima, obriga o denunciante ao pagamento de uma indemnização correspondente ao período de pré-aviso em falta, calculando-se o valor com base na média da remuneração auferida pelo Segundo Outorgante nos 6 (seis) meses anteriores à denúncia.

3. O incumprimento das obrigações contratuais legitima a resolução contratual e a consequente indemnização pelos eventuais danos sofridos, nos termos gerais da responsabilidade civil.

FEITO E ASSINADO, em duplicado, na data e local mencionados abaixo, pelas partes aí identificadas e assinadas, ficando um exemplar para cada uma das partes.

{{cidade_assinatura}}, {{data_assinatura}}

Primeiro Outorgante:
_______________________________________________________

Segunda Outorgante:
_______________________________________________________'
  ),
  jsonb_build_object(
    'motorista', jsonb_build_array(
      'motorista_nome', 'motorista_nif', 'motorista_documento_tipo', 'motorista_documento_numero',
      'motorista_morada', 'motorista_email', 'carta_conducao', 'carta_categorias',
      'carta_validade', 'cmtvde_numero', 'cmtvde_validade'
    ),
    'empresa', jsonb_build_array(
      'empresa_nome_completo', 'empresa_nif', 'empresa_sede', 'empresa_licenca_tvde',
      'empresa_licenca_validade', 'empresa_representante', 'empresa_cargo_representante'
    ),
    'contrato', jsonb_build_array('data_inicio', 'cidade_assinatura', 'data_assinatura')
  ),
  '/images/papel-timbrado-distancia-arrojada.png',
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates 
  WHERE empresa_id = 'distancia_arrojada' AND tipo = 'contrato_tvde'
);