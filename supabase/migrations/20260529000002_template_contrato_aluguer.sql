-- ============================================================
-- Template de Contrato de Aluguer (rent-a-car)
-- ============================================================
-- Até aqui só existia o template de contrato TVDE. O gerador de PDF
-- (generateContratoPdf) passou a escolher o template pelo `regime`:
-- rent_a_car procura "Contrato Aluguer - <Empresa>". Esta migration
-- semeia esse template.
--
-- O conteúdo (Condições Gerais) foi transcrito do modelo AnyRent da
-- DASPRENT RENT A CAR LDA. ATENÇÃO: É TEXTO LEGAL — rever contra a
-- versão oficial antes de usar em produção. As Condições Particulares
-- usam placeholders preenchidos pelo gerador:
--   {{empresa_*}}, {{motorista_*}} (cliente/condutor), {{carta_*}},
--   {{viatura_matricula|marca_modelo|grupo|kms}}, {{data_inicio|data_fim}},
--   {{duracao_meses}}, {{tarifa_diaria}}, {{franquia}}, {{caucao}},
--   {{kms_incluidos}}, {{km_adicional}}, {{total}}, {{observacoes}},
--   {{numero_contrato}}, {{cidade_assinatura}}, {{data_assinatura}}.
--
-- NOTA: o renderizador (jsPDF) é um walker HTML→PDF simples — suporta
-- h1/h2/p/br/strong/em/img + alinhamento inline. NÃO suporta tabelas,
-- por isso a layout é a uma coluna (sem grelha/diagrama do AnyRent).
--
-- org_id explícito (= Década Ousada) para a linha ser visível sob o
-- RLS restritivo rls_org_isolation. empresa_id = 'decada_ousada'.
-- ============================================================

-- Página limpa (sem papel timbrado): o logo WeGest é desenhado por código no
-- canto superior esquerdo (ver generateDocumentFromTemplate headerLogoUrl).
INSERT INTO public.document_templates (
  nome, tipo, empresa_id, org_id, template_data, campos_dinamicos, ativo, versao
)
VALUES (
  'Contrato Aluguer - DASPRENT',
  'contrato_aluguer',
  'decada_ousada',
  '11111111-1111-1111-1111-111111111111',
  jsonb_build_object('conteudo', $html$
<h1 style="text-align:center">CONTRATO DE ALUGUER Nº {{numero_contrato}}</h1>
<p style="text-align:center"><strong>CONDIÇÕES PARTICULARES</strong></p>
<br>
<p><strong>LOCADORA:</strong> {{empresa_nome_completo}}, NIF {{empresa_nif}}, com sede em {{empresa_sede}}.</p>
<br>
<p><strong>CLIENTE / CONDUTOR:</strong> {{motorista_nome}} — NIF {{motorista_nif}}</p>
<p>Morada: {{motorista_morada}}</p>
<p>Documento de identificação: {{motorista_documento_tipo}} {{motorista_documento_numero}} (validade {{motorista_documento_validade}})</p>
<p>Carta de condução: {{carta_conducao}} (validade {{carta_validade}})</p>
<p>Telefone: {{motorista_telefone}} · Email: {{motorista_email}}</p>
<br>
<p><strong>VIATURA:</strong> {{viatura_marca_modelo}} — Matrícula {{viatura_matricula}}</p>
<p>Grupo: {{viatura_grupo}} · Quilómetros: {{viatura_kms}}</p>
<br>
<p><strong>PERÍODO:</strong> Alugado em {{data_inicio}} · A devolver em {{data_fim}} · Duração: {{duracao_meses}} mês(es)</p>
<br>
<p><strong>CONDIÇÕES FINANCEIRAS:</strong></p>
<p>Tarifa diária: {{tarifa_diaria}} · Franquia: {{franquia}} · Caução: {{caucao}}</p>
<p>Quilómetros incluídos: {{kms_incluidos}} · Valor do km adicional: {{km_adicional}}</p>
<p>Total: {{total}}</p>
<br>
<p><strong>OBSERVAÇÕES:</strong> {{observacoes}}</p>
<br>
<p>O LOCATÁRIO declara aceitar as Condições Particulares e as Condições Gerais constantes deste documento.</p>
<br>
<p>{{cidade_assinatura}}, {{data_assinatura}}</p>
<br><br>
<p>_____________________________________&nbsp;&nbsp;&nbsp;&nbsp;_____________________________________</p>
<p>A LOCADORA&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;O LOCATÁRIO</p>
<br>
<h2 style="text-align:center">CONDIÇÕES GERAIS</h2>

<p><strong>Cláusula 1ª — Objecto</strong></p>
<p>1. Através do presente contrato de aluguer, a LOCADORA aluga o veículo automóvel melhor descrito nas Condições Particulares deste contrato, ao Cliente, também identificado nas Condições Particulares deste contrato, adiante designado LOCATÁRIO, nos termos das Condições Gerais que se seguem.</p>
<p>2. Verificando-se a indisponibilidade do veículo previamente contratado ou objecto de reserva, a LOCADORA assegurará a prestação de serviço equivalente ou disponibilizará um veículo de gama superior, sem qualquer custo adicional para o LOCATÁRIO.</p>

<p><strong>Cláusula 2ª — Entrega e Devolução do Veículo</strong></p>
<p>1. O LOCATÁRIO declara ter recebido o veículo identificado nas Condições Particulares do presente contrato, em boas condições de utilização e limpeza, nos termos da verificação conjunta designada "check out", com os respectivos equipamentos, acessórios e documentos, nomeadamente documento único automóvel, documento comprovativo da apólice de seguro de responsabilidade civil automóvel, ficha de inspeção, quando aplicável, cópia do presente Contrato, e equipado, designadamente, com os pneus em boas condições, com o nível de carga e quilometragem ali descritos, comprometendo-se a devolvê-lo nas mesmas condições em que o recebeu, no local e data designados nas Cláusulas Particulares deste Contrato.</p>
<p>2. Em caso de deterioração dos pneus por razões alheias a uma utilização prudente e normal, o LOCATÁRIO obriga-se a substituir o par de pneus dianteiro e/ou traseiro, conforme o pneu que tenha sido danificado, de imediato e à sua custa, por pneus com as mesmas características e marca, embora possa liquidar o custo da substituição dos pneus à LOCADORA, nos termos da tabela em vigor nesse momento.</p>
<p>3. A LOCADORA não é responsável perante o LOCATÁRIO ou qualquer terceiro pela perda, roubo, furto ou danos materiais de bens deixados no interior do veículo, durante e após o período de aluguer.</p>
<p>4. O LOCATÁRIO devolverá o veículo no termo do Contrato ou à data da sua resolução, salvo acordo (escrito) em contrário, nas instalações da LOCADORA onde o mesmo foi entregue, dentro das horas de expediente, ou em local por esta indicado, sob pena de se considerar incumprido o presente Contrato.</p>
<p>5. No momento em que o LOCATÁRIO devolver o veículo à LOCADORA, esta obriga-se a entregar-lhe documento comprovativo de que o veículo foi entregue pelo LOCATÁRIO e aceite pela LOCADORA.</p>
<p>6. Se o veículo for deixado em local diferente do acordado, haverá lugar a uma indemnização quilométrica ou uma "taxa" de retorno, em conformidade com as tarifas em vigor na LOCADORA correspondentes à distância entre o local onde o veículo ficar e o local acordado, bem como ao pagamento de todas e quaisquer despesas que sejam originadas pela falta de carga da bateria, necessidade de rebocar o veículo, e danos provocados no veículo em virtude de não ter sido devolvido no local acordado.</p>
<p>7. O LOCATÁRIO é responsável por todas as perdas ou danos, incluindo o furto ou roubo do veículo, caso o mesmo não seja devolvido a um funcionário da LOCADORA.</p>
<p>8. Não sendo o veículo devolvido na data acordada, o LOCATÁRIO obriga-se a pagar à LOCADORA, a título de cláusula penal, por cada dia de mora, inteiro ou fração, uma quantia calculada com base no triplo da tarifa diária para o veículo alugado, sujeitando-se ainda a que a LOCADORA desencadeie os procedimentos judiciais cíveis e/ou criminais necessários à recuperação do veículo e ressarcimento dos prejuízos sofridos, nomeadamente o recurso a procedimento cautelar adequado à restituição do veículo.</p>
<p>9. Apresentando o veículo defeitos, danos ou níveis de sujidade contrários ao seu normal e prudente uso, designadamente por ter odor a tabaco, por ter transportado animais, por se encontrar vomitado, ou outro, exigindo à LOCADORA uma limpeza extraordinária e profunda do exterior e/ou do interior do veículo, ou a sua higienização, ao invés de uma limpeza simples e corrente, como a que seria possível num centro de lavagem manual self-service, o LOCATÁRIO indemnizará a LOCADORA pelo respetivo custo da sua reparação, limpeza extraordinária e/ou higienização, bem como pelo tempo de imobilização do veículo para reparação, limpeza extraordinária e/ou higienização.</p>

<p><strong>Cláusula 3ª — Utilização do Veículo</strong></p>
<p>1. O LOCATÁRIO obriga-se a:</p>
<p>a) Fazer um uso normal e prudente do veículo, cumprindo a Lei, em especial o Código da Estrada, assegurando-se que o veículo fica devidamente parqueado em local seguro e fechado à chave, quando não esteja a ser utilizado;</p>
<p>b) Ceder a condução do veículo alugado apenas aos condutores expressamente autorizados pela LOCADORA, desde que estes tenham idade superior a 25 (vinte e cinco) anos e possuam carta de condução válida há mais de 2 anos ou, idade compreendida entre os 20 (vinte) e os 24 (vinte e quatro) anos, possuam carta de condução válida há mais de 2 anos e tenham efectuado o pagamento da taxa suplementar cobrada pela LOCADORA nos termos da tabela de preços em vigor e afixada por esta;</p>
<p>c) Não deixar os documentos do veículo no seu interior, sendo sempre deles portador;</p>
<p>d) Não fumar, ou permitir que os passageiros fumem, dentro do veículo;</p>
<p>e) Carregar a bateria do veículo sempre que necessário e pelo tempo necessário, de modo a que esta nunca atinja um nível inferior a 10% (dez por cento) nem superior a 90% (noventa por cento) do total da carga; mais se obriga a proceder ao carregamento da bateria do veículo utilizando corretamente os carregadores adequados a esse efeito, quando necessário;</p>
<p>f) Restituir o veículo findo o prazo de aluguer, no mesmo estado de conservação e limpeza, com o equipamento, chave e documentos respectivos;</p>
<p>g) Pagar, logo que solicitado, o preço de aluguer e os encargos decorrentes que lhe sejam imputados pela LOCADORA, nomeadamente por: reparações de danos no veículo; eletricidade em falta para carregamento das baterias do veículo até ao nível permitido na cláusula quinta, número quatro destas condições gerais; a "taxa" de reabastecimento ou as limpezas extraordinárias;</p>
<p>h) Pagar as taxas de portagem e estacionamento, físicos ou eletrónicos, incluindo quaisquer custos administrativos adicionais que venham a ser imputados. A LOCADORA não se responsabiliza por qualquer pagamento decorrente da não regularização dentro do prazo legal por motivo imputável ao LOCATÁRIO;</p>
<p>i) Comunicar imediatamente qualquer defeito ou anomalia de funcionamento do veículo;</p>
<p>j) Evitar que por ato ou omissão, terceiros fiquem com a convicção de que o veículo é sua propriedade, avisando a LOCADORA imediatamente em caso de penhora, arresto, furto, roubo, requisição, confisco ou qualquer outra ofensa de propriedade, posse ou detenção do veículo.</p>
<p>2. Sem prejuízo de responsabilidade civil, o LOCATÁRIO, sob pena de exclusão da cobertura do seguro, não permitirá que o veículo seja:</p>
<p>a) Conduzido por pessoas: i) não identificada e aceite pela LOCADORA, conforme o estipulado no Contrato ou qualquer anexo ou alterações que dele façam parte integrante; ii) sob a influência de álcool, de narcóticos ou outro estado de perturbação similar que, direta ou indiretamente, reduza a sua perceção e capacidade de reação;</p>
<p>b) Seja utilizado para empurrar ou puxar qualquer veículo ou reboque ou qualquer outro objeto com ou sem rodas; em provas ou em treinos desportivos de qualquer natureza, oficiais ou não; transporte em violação da Lei, nomeadamente do que, sobre esta matéria, se dispõe no Documento Único Automóvel do veículo;</p>
<p>c) Seja utilizado para efectuar transporte de passageiros ou mercadorias em violação da lei.</p>
<p>3. É vedado ao LOCATÁRIO, relativamente ao veículo, seus documentos, ferramentas, peças, equipamento, cabos e acessórios de carregamento e demais componentes, praticar os seguintes atos: sublocar, emprestar, ceder, vender, onerar ou por qualquer forma dar em garantia, transformar, substituir, modificar ou colocar menções publicitárias ou comerciais.</p>
<p>4. O LOCATÁRIO é exclusivamente responsável pelas coimas, multas e outras penalizações que os Tribunais e as Autoridades Administrativas fixarem, na sequência de processos contraordenacionais e penais por infrações ao Código da Estrada, portagens, estacionamento, entre outras cometidas com o veículo, durante o período de aluguer.</p>
<p>5. É vedado ao LOCATÁRIO circular com o veículo fora de estradas ou caminhos asfaltados, ou asfaltados com graves deficiências ou irregularidades que sejam susceptíveis de provocar danos no veículo, bem como em quaisquer lugares que não se destinem à circulação automóvel (ex. praias, caminhos florestais, caminhos de terra e/ou gravilha), em circuitos automóveis, autódromos ou outros semelhantes.</p>
<p>6. O LOCATÁRIO é responsável por todos e quaisquer danos provocados na parte superior e inferior do veículo, bem como no topo e no seu interior, durante a vigência do presente contrato, desde que tais danos não estejam cobertos pela apólice de seguro vigente durante esse período.</p>
<p>7. O LOCATÁRIO só pode utilizar o veículo fora do Território Continental Português, em Países cobertos pelo Certificado Internacional da Carta Verde, após autorização escrita da LOCADORA, que poderá exigir a prestação de garantia suplementar até ao limite do valor comercial do veículo; o LOCATÁRIO deverá solicitar a autorização com antecedência mínima de 48 horas, presumindo-se não autorizada a saída do veículo em caso de silêncio da LOCADORA.</p>
<p>8. O Contrato considerar-se-á automaticamente resolvido se o veículo for utilizado em condições que constituam violação do mesmo, tendo a LOCADORA o direito a recuperar o veículo, a qualquer momento e por qualquer forma, sem necessidade de aviso prévio, sendo os respectivos encargos da exclusiva responsabilidade do LOCATÁRIO, sem prejuízo das indemnizações a que legal ou contratualmente caibam à LOCADORA ou a terceiros, se for o caso.</p>

<p><strong>Cláusula 4ª — Preço, prazos e pagamentos</strong></p>
<p>1. O preço de aluguer é determinado pela tarifa em vigor para a categoria do respetivo veículo e pago antecipadamente, conforme melhor consta das Cláusulas Particulares.</p>
<p>2. O preço deverá ser pago em "EURO".</p>
<p>3. Caso o LOCATÁRIO deseje o prolongamento do aluguer, deverá obter previamente e por escrito a concordância da LOCADORA, procedendo ao pagamento antecipado dos montantes de aluguer devidos pelo prolongamento acordado.</p>
<p>4. Verificando-se o prolongamento do aluguer, o LOCATÁRIO deverá manter sempre consigo o seu duplicado do presente Contrato, bem como o documento comprovativo do prolongamento acordado com a LOCADORA.</p>
<p>5. Caso a LOCADORA não dê o seu consentimento escrito ao prolongamento do aluguer, este cessa no termo do prazo estabelecido no presente Contrato, ficando o LOCATÁRIO obrigado à entrega do veículo nos termos previstos na cláusula 2ª das Condições Gerais do presente Contrato.</p>
<p>6. O LOCATÁRIO obriga-se ainda a pagar à LOCADORA, além do preço de aluguer:</p>
<p>a) O valor referente à caução devida pelo aluguer, nos termos da tarifa em vigor na LOCADORA no momento da celebração do presente Contrato;</p>
<p>b) O valor referente à franquia do seguro, correspondente à categoria do veículo alugado pelo presente contrato e definida na tabela em vigor na LOCADORA;</p>
<p>c) O valor correspondente ao preço dos serviços adicionais contratados nas Condições Particulares, de acordo com a tabela em vigor e afixada na LOCADORA;</p>
<p>d) O preço correspondente à duração efetiva do aluguer, em função do período de aluguer e respetiva quilometragem calculada de acordo com a tarifa em vigor na LOCADORA para a categoria do veículo alugado e para o território no qual se destine e esteja autorizado a circular;</p>
<p>e) O preço de €15 (quinze euros), acrescido de IVA à taxa legal em vigor, até ao máximo de 60€ (sessenta euros) sempre que o veículo alugado for expressamente autorizado pela LOCADORA a circular fora do território nacional em países cobertos pelo Certificado Internacional de Carta Verde;</p>
<p>f) O preço diário de €5 (cinco euros) por cada condutor adicional que seja expressamente autorizado pela LOCADORA, até ao máximo de €50 (cinquenta euros) durante o período inicial do contrato de aluguer, acrescido de IVA à taxa legal em vigor;</p>
<p>g) O preço de €60 (sessenta euros), acrescido de IVA à taxa legal em vigor, por cada condutor (principal ou adicional) com idade compreendida entre os 20 e os 24 anos, e com carta de condução válida há mais de 2 anos;</p>
<p>h) Os montantes correspondentes aos danos emergentes de acidente a que tiver dado causa, a furto ou roubo, eventuais despesas com internamento e assistência médica do condutor e demais passageiros, quando não cobertos pelo seguro. Se tais danos forem cobertos pelo seguro, o LOCATÁRIO fica obrigado a indemnizar a LOCADORA subsidiariamente, bem como a pagar-lhe o montante máximo das respetivas franquias;</p>
<p>i) Os valores correspondentes aos impostos e taxas exigíveis por força das situações previstas nas alíneas antecedentes;</p>
<p>j) O montante de €50,00 (cinquenta euros), acrescido de IVA, à taxa legal em vigor, por cada documento do veículo que seja destruído, sofra deterioração anormal, ou, por qualquer meio, seja extraviado;</p>
<p>k) O montante de €250 (duzentos e cinquenta euros), acrescido de IVA à taxa legal em vigor, em caso de destruição, deterioração anormal, ou extravio, por perda ou roubo, da chave do veículo;</p>
<p>l) O montante, definido por lei e praticado pelo fornecedor de energia elétrica, por cada KWh de energia em PCR, acrescido de IVA à taxa legal em vigor, e taxa pelo serviço de carregamento da bateria do veículo até ao nível mínimo previsto no número quatro, da cláusula quinta das presentes condições gerais, à tarifa em vigor na LOCADORA, sempre que, findo o aluguer, este não seja devolvido nessas condições;</p>
<p>m) A verba de €100,00 (cem euros), acrescido de IVA à taxa legal em vigor, em caso de necessidade de limpeza extraordinária ou higienização do veículo, bem como o valor correspondente à tarifa diária de aluguer por cada dia em que o veículo não possa ser alugado por estar a ser sujeito a limpeza ou higienização;</p>
<p>n) As despesas judiciais e extrajudiciais, multas e outras sanções pecuniárias, qualquer que seja a sua natureza, decorrentes da violação de qualquer norma legal imputável ao LOCATÁRIO ou ao veículo durante o período em que, por via do presente contrato de aluguer, esteve à sua guarda e sob a sua responsabilidade;</p>
<p>o) Sendo a LOCADORA notificada, em consequência de contraordenação ou conduta ilícita praticada pelo LOCATÁRIO, para identificar o mesmo, este obriga-se a pagar-lhe, a título de despesas administrativas, o montante de €32,00 (trinta e dois euros), acrescido de IVA à taxa legal em vigor, pela informação prestada às entidades competentes;</p>
<p>p) O montante de €100 (Cem Euros), acrescido de IVA à taxa legal em vigor, a título de despesas administrativas na eventualidade de a LOCADORA ter que analisar a cobrança de danos;</p>
<p>q) As despesas e custos, designadamente judiciais, incorridos pela LOCADORA para obter o cumprimento pelo LOCATÁRIO do disposto no Contrato, nomeadamente a cobrança de quantias que lhe sejam devidas por este, nos termos legalmente previstos;</p>
<p>r) O custo da reparação dos danos a que tiver dado causa, nomeadamente por choque, colisão, capotamento, furto e/ou roubo do veículo, bem como da sua imobilização por cada dia em que o veículo não possa ser alugado, calculados com base no orçamento para a reparação e/ou na reposição do estado em que o veículo se encontrava antes de ter sofrido o dano ou sinistro, no momento da ocorrência dos factos, e com a tarifa diária de aluguer em vigor na LOCADORA, desde que não se encontrem cobertos por apólice de seguro em vigor;</p>
<p>s) O custo da reposição de quaisquer cabos, acessórios ou componentes, designadamente de carregamento, da bateria ou da viatura, que tenham sido entregues com esta ao LOCATÁRIO e não tenham sido por este devolvidos;</p>
<p>t) O custo da substituição por peças ou componentes de origem da viatura caso o LOCATÁRIO tenha procedido à sua substituição sem expressa autorização da LOCADORA;</p>
<p>u) O custo de reparação de todos e quaisquer danos provocados pelo LOCATÁRIO por má utilização, por uso excessivo ou por uso em condições anormais face às características e capacidades da viatura.</p>
<p>7. No caso do veículo alugado ser da marca TESLA, e o LOCATÁRIO proceder à carga da respetiva bateria em carregadores "Supercharge" (SUC) da TESLA, ficará ainda obrigado a pagar à LOCADORA o preço correspondente à electricidade utilizada no SUC da Tesla, acrescido da taxa de ocupação do SUC devida à TESLA pela utilização do SUC por mais de cinco minutos após o carregamento completo do veículo, durante o período de vigência do presente contrato, e de acordo com os valores faturados pela TESLA à LOCADORA.</p>
<p>8. Para garantia do cumprimento da obrigação prevista no número precedente, o LOCATÁRIO autoriza o bloqueio de uma pré-autorização no montante definido nas Condições Particulares, em cartão de crédito válido, ficando esta verba cativa, a título de caução, durante 30 dias após a data de entrega do veículo e cessação do presente contrato, para fazer face aos pagamentos devidos, de débitos que possam ocorrer em momento consequente à detecção de utilização do SUC da TESLA, aceitando que os débitos possam ocorrer depois do fim do contrato, desde que essa utilização se tenha verificado durante a sua vigência.</p>
<p>9. O LOCATÁRIO, para garantia do cumprimento das obrigações decorrentes do Contrato, nomeadamente quanto ao aluguer, à carga da bateria, às taxas de portagem e de estacionamento, à utilização do SUC da TESLA, à franquia de seguro, prestará caução por qualquer montante referido nas condições particulares do presente Contrato, em numerário, através de cheque visado ou débito em cartão de crédito, autorizando expressamente a LOCADORA a preencher e a debitar as importâncias devidas.</p>
<p>10. A caução referida no número precedente será restituída ao LOCATÁRIO logo que o veículo seja devolvido à LOCADORA, no estado em que lhe foi entregue, e sejam liquidados todos os valores devidos pelo primeiro. Todavia, caso existam valores por liquidar (entre outros: dias adicionais de aluguer, despesas de electricidade/carregamento e/ou a franquia), a LOCADORA aplicará o valor da caução, total ou parcialmente, no pagamento dos mesmos, sem prejuízo de reclamar judicialmente o montante ainda em dívida.</p>
<p>11. Toda e qualquer fatura não paga na data do respectivo vencimento será acrescida de juros de mora, calculados à taxa legal em vigor, desde a data do vencimento até integral e efetivo pagamento.</p>

<p><strong>Cláusula 5ª — Manutenção, Reparação do Veículo e Nível de Carga da Bateria</strong></p>
<p>1. Caso se aperceba da existência de qualquer problema técnico no veículo, o LOCATÁRIO deve imobilizá-lo imediatamente e contactar a LOCADORA ou, quando tal facto ocorra fora do horário de expediente, a assistência em viagem.</p>
<p>2. No caso do veículo ficar imobilizado devido a avaria, as reparações só poderão ser efetuadas pelo LOCATÁRIO quando autorizadas, por escrito, pela LOCADORA e de acordo com as instruções que esta, expressamente, lhe transmitir, devendo o seu preço constar de fatura detalhada com indicação das peças substituídas, e emitida a favor da LOCADORA.</p>
<p>3. As despesas de reboque, bem como de qualquer avaria, dentro ou fora do País, devido à má utilização do veículo, designadamente por ter ficado sem carga na bateria, serão da exclusiva responsabilidade do LOCATÁRIO.</p>
<p>4. O veículo é entregue ao LOCATÁRIO com a bateria carregada nos termos descritos nas cláusulas particulares do presente contrato, pelo que deverá ser devolvido à LOCADORA em igual estado ou com o nível de carga da bateria inferior até 10% (dez por cento) em relação àquele com que a bateria foi entregue ao LOCATÁRIO, sob pena de lhe ser imputado o custo da eletricidade em falta, acrescido de "taxa" de serviço de carregamento legalmente permitida.</p>
<p>5. O Locatário deve tomar todas as medidas de proteção necessárias para manter o veículo nas mesmas condições em que lhe foi entregue, verificando com regularidade, nomeadamente: i) o estado geral do veículo; ii) a pressão dos pneus; iii) o nível de carga da bateria, não permitindo que este seja inferior a 10% (dez por cento) da carga total, procedendo, nesse caso, ao seu imediato carregamento.</p>
<p>6. Em caso de incorreto manuseamento ou utilização de carregadores inadequados para carregar os veículos elétricos, o LOCATÁRIO é responsável por todas as despesas inerentes à reparação de quaisquer danos daí decorrentes que sejam causados no veículo, bem como aos danos que resultem para a LOCADORA pela sua imobilização durante o período de reparação.</p>
<p>7. A LOCADORA não procederá ao reembolso da eletricidade não utilizada pelo LOCATÁRIO.</p>

<p><strong>Cláusula 6ª — Seguros</strong></p>
<p>1. O LOCATÁRIO e/ou o condutor autorizado do veículo, participam como segurados de uma apólice de seguro de automóveis que cobre a responsabilidade civil limitada até ao montante máximo de € 50.000.000,00, em conformidade com as leis vigentes no País.</p>
<p>2. O LOCATÁRIO e/ou o condutor autorizado participam como segurados na apólice de seguro de automóveis, denominada LDW, que abrange todos os danos causados na viatura em caso de acidente (choque, colisão, capotamento), furto e roubo da viatura, ficando sujeitos ao pagamento da franquia correspondente à categoria do veículo alugado pelo presente contrato e definida na tabela em vigor na LOCADORA; estando excluídos todos e quaisquer danos provocados nas partes superiores e inferiores, no interior e no exterior do veículo, bem como nos pneus, jantes, vidros, desde que não tenham sido provocados por acidente, furto ou roubo.</p>
<p>3. O LOCATÁRIO e/ou o condutor autorizado compromete-se a proteger os interesses da LOCADORA e da sua Companhia de Seguros, procedendo, designadamente, da seguinte forma:</p>
<p>a) Participando imediatamente às autoridades policiais, e logo que possível, mas sem exceder o prazo máximo de vinte e quatro horas, à LOCADORA, qualquer acidente, furto, roubo e/ou incêndio, mesmo que parcial, danos causados por animais ou quaisquer outros sinistros obtendo os nomes e endereços das pessoas envolvidas e testemunhas;</p>
<p>b) Não abandonando o local do acidente, furto, roubo e/ou incêndio antes da chegada das autoridades policiais, a menos que o seu estado de saúde o imponha, sob pena de lhe serem imputados os danos decorrentes daquele facto e/ou os custos de redução de franquia, eventualmente contratado, qualquer efeito em caso de incumprimento desta cláusula;</p>
<p>c) Mencionando na participação as circunstâncias efetivas em que ocorreu o acidente, a data, a hora, o local, nome e morada das testemunhas, o nome e morada do proprietário e do condutor do terceiro veículo envolvido e a matrícula, marca, companhia de seguros e número de apólice do terceiro veículo;</p>
<p>d) Obrigando-se a não se declarar em caso algum, responsável ou culpado do acidente junto de terceiro, sob pena da LOCADORA exercer sobre si o direito de regresso;</p>
<p>e) Contactando a LOCADORA, com a maior celeridade possível dadas as circunstâncias concretas do sinistro, fornecendo-lhe um relatório detalhado do sinistro, incluindo o auto de notícia levantado pelas autoridades policiais;</p>
<p>f) Entregando toda a documentação de suporte relativa ao sinistro na estação de devolução da viatura;</p>
<p>4. Caso o LOCATÁRIO e/ou o condutor autorizado incumpra alguma das obrigações previstas no número precedente, a LOCADORA reserva-se o direito de cobrar os custos adicionais de reparação e/ou recuperação da viatura.</p>
<p>5. O LOCATÁRIO e/ou o condutor autorizado pode contratar as seguintes coberturas adicionais:</p>
<p>5.1. LDW 30 — abrange todos os danos causados na viatura em caso de acidente (choque, colisão, capotamento), furto e roubo da viatura, ficando o LOCATÁRIO e/ou condutor autorizado obrigado ao pagamento da franquia correspondente ao grupo do veículo alugado pelo presente contrato, definida na tabela em vigor na LOCADORA, reduzida em 30%; estando excluídos todos e quaisquer danos provocados nas partes superiores e inferiores, no interior e no exterior do veículo, bem como nos pneus, jantes, vidros, desde que não tenham sido provocados por acidente, furto ou roubo.</p>
<p>5.2. LDW 60 — abrange todos os danos causados na viatura em caso de acidente (choque, colisão, capotamento), furto e roubo da viatura, ficando o LOCATÁRIO e/ou condutor autorizado obrigado ao pagamento da franquia correspondente ao grupo do veículo alugado pelo presente contrato, definida na tabela em vigor na LOCADORA, reduzida em 60%; estando excluídos todos e quaisquer danos provocados nas partes superiores e inferiores, no interior e no exterior do veículo, bem como nos pneus, jantes, vidros, desde que não tenham sido provocados por acidente, furto ou roubo.</p>
<p>5.3. QIV — abrange quebra isolada de vidros (exceto espelhos retrovisores, ópticas, faróis) até ao limite do capital seguro de €1.000 (mil euros). Esta cobertura adicional poderá ser subscrita pelo LOCATÁRIO e/ou condutor autorizado no momento da celebração do presente contrato, pelo preço que consta da tabela em vigor na LOCADORA.</p>
<p>5.4. PAI — abrange as despesas de tratamento de todos os ocupantes, incluindo o condutor, cujos montantes máximos são de €1.500 (mil e quinhentos euros) no caso de doença provocada por acidente de viação na vigência deste contrato de aluguer, e de €15.000 (quinze mil euros) no caso de morte ou invalidez dos ocupantes e condutor, não ficando o Locatário e/ou condutor autorizado sujeito ao pagamento de qualquer franquia. Esta cobertura adicional poderá ser subscrita pelo LOCATÁRIO e/ou condutor autorizado no momento da celebração do presente contrato, pelo preço que consta da tabela em vigor na LOCADORA.</p>
<p>6. Em caso de sinistro, mesmo com a entrega da DAAA (Declaração Amigável de Acidente Automóvel), o LOCATÁRIO é responsável pelo pagamento dos danos causados à viatura até ao montante máximo da franquia em vigor no período do Contrato, exceto se a responsabilidade for assumida por terceiros.</p>
<p>7. Apenas o LOCATÁRIO e/ou o condutor autorizado usufruirá dos serviços adicionais de redução de franquia; a inobservância desta disposição implica a anulação total das coberturas adicionais constantes deste artigo que tenham sido contratadas nas Condições Particulares, ficando igualmente nulas as disposições deste artigo em caso de acidente motivado por negligência, embriaguez, uso de estupefaciente ou não cumprimento por parte do LOCATÁRIO e/ou condutor de todas as condições gerais do aluguer e das normas do Código da Estrada e demais legislação aplicável, sendo igualmente anulada a cobertura de seguro se o LOCATÁRIO não devolver à LOCADORA as chaves da viatura em caso de roubo e/ou furto.</p>
<p>8. Em caso de má utilização do veículo, ou acidente devido a excesso de velocidade, negligência, condução sob influência de álcool, produtos estupefacientes ou consumo de qualquer produto que diminua a capacidade de condução, será o LOCATÁRIO e/ou condutor responsável pela totalidade das despesas da reparação e indemnização correspondente ao tempo de paralisação do veículo acidentado, mesmo que haja sido contratado um serviço de redução de franquia.</p>

<p><strong>Cláusula 7ª — Direito de resolução do contrato</strong></p>
<p>Caso o LOCATÁRIO incumpra algum dos seus deveres contratuais, nomeadamente quando faça da viatura um uso anormal, imprudente e excessivo para além das suas características e capacidades, assiste à LOCADORA o direito de o resolver com justa causa, com efeitos imediatos, recuperando a viatura por qualquer meio legal admissível, não assistindo ao LOCATÁRIO qualquer direito de retenção ou de indemnização.</p>

<p><strong>Cláusula 8ª — Serviço de assistência</strong></p>
<p>O LOCATÁRIO dispõe do serviço de assistência, 24 horas por dia através do telefone número +351 917 197 712.</p>

<p><strong>Cláusula 9ª — Dados pessoais do Locatário</strong></p>
<p>1. Nos termos do disposto na legislação de proteção de dados pessoais a LOCADORA, designada DASPRENT RENT A CAR LDA, NIF 516989820, com sede na Rua Dionísio Rodrigues 60 2415-801 Leiria, na qualidade de responsável irá proceder ao tratamento dos dados pessoais do Cliente com base nos fundamentos jurídicos indicados e conservando-os durante os períodos indicados, para as seguintes finalidades:</p>
<p>1.1. Gestão administrativa de clientes, para execução do contrato de aluguer de veículos ligeiros sem condutor e cumprimento de obrigações jurídicas ao abrigo dos Decretos-lei 181/2012, de 6 de agosto, revisto e alterado pelo Decreto-Lei 47/2018, de 20 de Junho, e 15/88, de 16 de Janeiro, durante 10 anos;</p>
<p>1.2. Gestão de faturação, cobranças e pagamento, para execução do contrato de aluguer de veículos ligeiros sem condutor, durante 10 anos;</p>
<p>1.3. Histórico de relações comerciais, para cumprimento de obrigações legais da LOCADORA, durante 10 anos;</p>
<p>1.4. Gestão e recuperação de créditos litigiosos, para execução do contrato de aluguer de veículos ligeiros, durante 10 anos; Análise de perfis de consumo, tendo por base o interesse legítimo da LOCADORA, durante 10 anos.</p>
<p>2. Quando a comunicação dos dados pessoais constitui uma obrigação legal e contratual da LOCADORA, o seu fornecimento pelo LOCATÁRIO é um requisito necessário para celebração do presente contrato. Nestes casos, se o LOCATÁRIO não fornecer os seus dados pessoais, o contrato não será celebrado e a LOCADORA não dará seguimento ao seu pedido.</p>
<p>3. O LOCATÁRIO autoriza que os seus dados pessoais sejam transmitidos às seguintes entidades para as finalidades indicadas:</p>
<p>3.1. Autoridades privadas e públicas, no âmbito de auditorias, inquéritos, inspeções e investigações no âmbito das competências legais das mesmas, nomeadamente, órgãos de polícia, instituições públicas e concessionários de autoestradas;</p>
<p>3.2. Mandatários judiciais e tribunais, para efeitos de representação, declaração, exercício ou defesa de direitos em processos judiciais;</p>
<p>3.3. Autoridade Tributária, para efeitos de cumprimento de obrigações fiscais.</p>
<p>4. O LOCATÁRIO autoriza/ não autoriza (riscar o que não interessa) que os seus dados pessoais sejam transmitidos à ARAC (Associação dos Industriais de Aluguer de Automóveis sem Condutor), para inclusão na Base de Dados de clientes incumpridores;</p>
<p>5. A utilização dos dados pessoais mencionados no âmbito da finalidade de análise de perfis de consumo, permite à LOCADORA personalizar a sua oferta comercial junto aos seus Clientes, tendo por base as suas reservas anteriormente efetuadas, não tendo qualquer impacto nas escolhas que o Cliente queira fazer e não sendo necessária para a celebração do contrato.</p>
<p>6. O LOCATÁRIO aceita que a sua assinatura fique registada em qualquer suporte duradouro, produzindo todos os efeitos legais.</p>
<p>7. Sem prejuízo do direito de apresentar reclamação junto à CNPD, o LOCATÁRIO tem o direito, nos termos da legislação, de solicitar à LOCADORA o acesso aos dados pessoais que lhe digam respeito, bem como a sua retificação ou o seu apagamento, e a limitação do tratamento no que disser respeito ao titular dos dados, ou do direito de se opor ao tratamento, bem como do direito à portabilidade dos dados através do correio electrónico geral@dasprent.pt ou por carta registada para Rua Dionísio Rodrigues 60 2415-801, Leiria.</p>
<p>8. Para efeitos do cumprimento do pedido de exercício do direito previsto no número precedente, a LOCADORA, em caso de dúvidas razoáveis quanto à identidade da pessoa singular que apresenta o pedido, pode solicitar que lhe sejam fornecidas as informações adicionais que forem necessárias para confirmar a identidade do titular dos dados.</p>

<p><strong>Cláusula 10ª — Serviço de disponibilização de meio de pagamento de taxas de portagem e estacionamento</strong></p>
<p>1. A LOCADORA oferece ao LOCATÁRIO o serviço adicional de disponibilização de meio de pagamento de taxa de portagem e estacionamento, mediante a disponibilização de identificador, da sua propriedade, através do qual o LOCATÁRIO poderá usufruir dos serviços de portagem eletrónica disponibilizados nas infraestruturas rodoviárias nacionais, e estacionamento, desde que aquelas infraestruturas e os parques de estacionamento se encontrem devidamente equipados para o efeito.</p>
<p>2. No caso previsto no número imediatamente precedente, o LOCATÁRIO fica responsável pelo identificador fornecido pela LOCADORA, enquanto este estiver sob a sua guarda e responsabilidade, bem como por fazer dele uma boa utilização, designadamente transpondo as barreiras apenas e só através dos canais devidamente identificados para a utilização deste serviço.</p>
<p>3. No caso previsto no número 1 da presente cláusula, o LOCATÁRIO é o único responsável pelo pagamento integral do valor das taxas de portagem e estacionamento registadas durante o período de vigência do presente contrato. Para efeitos do pagamento das taxas de portagem e estacionamento, o LOCATÁRIO autoriza o bloqueio de uma pré-autorização no montante definido nas Condições Particulares, em cartão de crédito válido, ficando esta verba cativa, a título de caução, durante 30 dias após a data de entrega da viatura, para fazer face aos pagamentos devidos, de débitos que possam ocorrer em momento consequente à deteção de utilização das infraestruturas rodoviárias (portagens) e dos parques de estacionamento, aceitando que os débitos possam ocorrer depois do fim do contrato, desde que a utilização dessas infraestruturas rodoviárias e parques de estacionamento se tenha verificado durante a sua vigência.</p>
<p>4. O LOCATÁRIO é ainda responsável pelo correto funcionamento e pela conservação, em perfeitas condições, do identificador Via Verde, fornecido pela LOCADORA, não podendo em caso algum retirar o referido equipamento do local onde o mesmo se encontra instalado, devendo comunicar à LOCADORA qualquer anomalia ou, após autorização desta, dirigir-se a um ponto de assistência Via Verde para resolução da mesma.</p>
<p>5. No caso de o cliente não pedir o identificador Via Verde, as portagens são cobradas com o acréscimo dos custos administrativos impostos por lei. A este valor acresce o IVA de 23%. (Salvo acordado previamente).</p>

<p><strong>Cláusula 11ª — Condutor Principal e Adicional</strong></p>
<p>O Condutor Principal, bem como o Adicional, identificados nas Condições Particulares, ficam obrigados nos exatos termos e condições gerais do presente Contrato.</p>

<p><strong>Cláusula 12ª — Disposições Finais</strong></p>
<p>1. As partes convencionam, expressamente, que, para efeitos legais e/ou judiciais, todas as citações e/ou notificações relacionadas com o presente Contrato, com a sua interpretação e cumprimento, deverão ser efetuadas para as moradas dos respetivos domicílios constantes do presente Contrato.</p>
<p>2. As partes acordam que, para dirimir qualquer litígio emergente da interpretação ou cumprimento do presente Contrato, é competente o foro da Comarca de Leiria, com expressa renúncia a qualquer outra, ressalvadas as normas legais imperativas.</p>
<p>3. O LOCATÁRIO declara conhecer que o veículo poderá estar equipado com dispositivo de geolocalização (GPS), que poderá ser utilizado pela LOCADORA e/ou pelas autoridades competentes, em caso de incumprimento contratual e/ou transposição de fronteira.</p>
<p>4. O LOCATÁRIO reconhece que todas as cláusulas do presente contrato lhe foram atempada e expressamente comunicadas e explicadas o seu conteúdo, bem como que lhe foi comunicada, conhece e aceita a tabela de preços praticados pela LOCADORA, referentes aos serviços aqui mencionados, ficando ciente das mesmas, celebrando o presente contrato no pleno uso da sua vontade e boa fé.</p>

<p><strong>Tabela de preços</strong></p>
<p>*Valor adicional ao preço de acerto do depósito de combustível no ato da entrega. A entrega de veículos em destinos que diferem de Lisboa e Porto é taxada sob consulta.</p>
<p>Combustível: 35,00€ · Limpeza: 20,00€ · Entrega Lisboa: 50,00€ · Entrega Porto: 60,00€ · Entrega noutros destinos: Sob consulta.</p>
$html$),
  '{"motorista": [], "empresa": [], "contrato": []}'::jsonb,
  true,
  1
)
ON CONFLICT (empresa_id, tipo, versao) DO NOTHING;
