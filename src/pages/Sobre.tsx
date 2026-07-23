import { SimpleNavbar } from '@/components/landing/SimpleNavbar';
import { Footer } from '@/components/landing/Footer';
import { motion } from 'framer-motion';
import { Users, Target, Award, Heart } from 'lucide-react';

const Sobre = () => {
  return (
    <div className="min-h-screen bg-black text-white">
      <SimpleNavbar />

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-b from-gray-900 to-black">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Sobre a <span className="text-primary">WeGest</span>
            </h1>
            <p className="text-xl text-gray-400">
              Construímos o WeGest a gerir a nossa própria frota TVDE e rent-a-car — hoje
              disponibilizamos o mesmo sistema a outras empresas do sector.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl font-bold mb-6">A Nossa Missão</h2>
              <p className="text-gray-400 mb-4">
                A WeGest nasceu com uma missão clara: proporcionar aos motoristas TVDE as melhores
                condições para desenvolverem a sua atividade de forma independente e lucrativa.
              </p>
              <p className="text-gray-400 mb-4">
                Acreditamos que cada motorista merece ter acesso a veículos de qualidade, suporte
                dedicado e condições transparentes que lhes permitam focar no que realmente importa
                - servir os seus clientes e construir o seu próprio negócio.
              </p>
              <p className="text-gray-400">
                Com uma frota moderna e uma equipa de suporte sempre disponível, trabalhamos todos
                os dias para que os nossos parceiros possam alcançar os seus objetivos
                profissionais.
              </p>
              <p className="text-gray-400 mt-4">
                Essa operação corre inteira no sistema que construímos — desde então, outras
                empresas de TVDE e rent-a-car pediram para usar o mesmo software na sua própria
                frota, e é isso que hoje também oferecemos.
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-primary/20 to-transparent rounded-2xl p-8 border border-primary/30"
            >
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center p-4">
                  <div className="text-4xl font-bold text-primary mb-2">500+</div>
                  <div className="text-gray-400">Motoristas Ativos</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-4xl font-bold text-primary mb-2">200+</div>
                  <div className="text-gray-400">Veículos na Frota</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-4xl font-bold text-primary mb-2">5</div>
                  <div className="text-gray-400">Anos de Experiência</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-4xl font-bold text-[#B20101] mb-2">24/7</div>
                  <div className="text-gray-400">Suporte Disponível</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16 bg-gray-900/50">
        <div className="container mx-auto px-4">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-3xl font-bold text-center mb-12"
          >
            Os Nossos Valores
          </motion.h2>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                icon: Users,
                title: 'Parceria',
                description:
                  'Tratamos cada motorista como um parceiro de negócio, não apenas um cliente.',
              },
              {
                icon: Target,
                title: 'Transparência',
                description: 'Condições claras e sem surpresas. Sabes sempre o que esperar.',
              },
              {
                icon: Award,
                title: 'Excelência',
                description: 'Veículos de qualidade e serviço de suporte de primeira classe.',
              },
              {
                icon: Heart,
                title: 'Compromisso',
                description: 'O teu sucesso é o nosso sucesso. Estamos aqui para te apoiar.',
              },
            ].map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-gray-800/50 rounded-xl p-6 text-center"
              >
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#B20101]/20 flex items-center justify-center">
                  <value.icon className="w-7 h-7 text-[#B20101]" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{value.title}</h3>
                <p className="text-gray-400 text-sm">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Sobre;
