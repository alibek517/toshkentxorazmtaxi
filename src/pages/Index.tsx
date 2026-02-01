import { Car, MapPin, Phone, Shield, Star, Users, MessageCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const telegramBotUrl = "https://t.me/ToshkentXorazm_TaxiBot";

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 taxi-gradient opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-br from-transparent to-taxi-dark/20" />
        
        <div className="relative container mx-auto px-4 py-20 lg:py-32">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-card/20 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
              <Car className="h-5 w-5 text-taxi-dark" />
              <span className="text-taxi-dark font-medium">Toshkent ↔ Xorazm</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-taxi-dark mb-6 leading-tight">
              Tez va Ishonchli
              <br />
              <span className="text-primary">Taxi Xizmati</span>
            </h1>
            
            <p className="text-lg md:text-xl text-taxi-dark/80 mb-10 max-w-2xl mx-auto">
              Toshkent va Xorazm o'rtasida qulay sayohat. Ishonchli haydovchilar, arzon narxlar, 24/7 xizmat.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="taxi-btn-primary text-lg px-8 py-6 rounded-xl shadow-xl"
                onClick={() => window.open(telegramBotUrl, "_blank")}
              >
                <MessageCircle className="mr-2 h-5 w-5" />
                Telegram Bot
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="text-lg px-8 py-6 rounded-xl border-taxi-dark/20 bg-card/50 backdrop-blur-sm"
                onClick={() => window.open("tel:+998975002086", "_blank")}
              >
                <Phone className="mr-2 h-5 w-5" />
                +998 97 500 20 86
              </Button>
            </div>
          </div>
        </div>

        {/* Wave decoration */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path 
              d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 37.5C840 45 960 60 1080 67.5C1200 75 1320 75 1380 75L1440 75V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" 
              fill="hsl(var(--background))"
            />
          </svg>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Nima uchun bizni tanlashadi?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Yillar davomida minglab yo'lovchilarimizga xizmat ko'rsatib kelmoqdamiz
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard 
              icon={<Shield className="h-8 w-8" />}
              title="Xavfsiz"
              description="Barcha haydovchilar tekshirilgan va tajribali"
            />
            <FeatureCard 
              icon={<Star className="h-8 w-8" />}
              title="Sifatli"
              description="Qulay va toza mashinalar"
            />
            <FeatureCard 
              icon={<Users className="h-8 w-8" />}
              title="Ishonchli"
              description="1000+ mamnun mijozlar"
            />
            <FeatureCard 
              icon={<MapPin className="h-8 w-8" />}
              title="Keng qamrov"
              description="Urganch, Nukus, Xiva va boshqalar"
            />
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Xizmatlarimiz</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <ServiceCard 
              icon={<Car className="h-10 w-10 text-primary" />}
              title="🚕 Taxi zakaz qilish"
              description="Toshkent – Xorazm yo'nalishida tez va qulay sayohat"
              onClick={() => window.open(telegramBotUrl, "_blank")}
            />
            <ServiceCard 
              icon={<Users className="h-10 w-10 text-accent" />}
              title="🚖 Haydovchi bo'lish"
              description="VIP guruhimizga qo'shiling va doimiy daromad oling"
              onClick={() => window.open(telegramBotUrl, "_blank")}
            />
            <ServiceCard 
              icon={<Package className="h-10 w-10 text-secondary" />}
              title="📦 Pochta yuborish"
              description="Tez va ishonchli pochta yetkazib berish"
              onClick={() => window.open(telegramBotUrl, "_blank")}
            />
          </div>
        </div>
      </section>

      {/* Routes */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Yo'nalishlar</h2>
          </div>

          <div className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto">
            {["Toshkent", "Urganch", "Nukus", "Xiva", "Beruniy", "To'rtko'l", "Gurlan", "Yangi Bozor", "Shovot", "Qo'ng'irot", "Mo'ynoq", "Chimboy", "Taxiatosh", "Ellikqal'a", "Bog'ot"].map((city) => (
              <span 
                key={city}
                className="px-4 py-2 bg-card rounded-full border border-border text-sm font-medium"
              >
                📍 {city}
              </span>
            ))}
            <span className="px-4 py-2 bg-muted rounded-full border border-border text-sm font-medium text-muted-foreground cursor-default">
              + 26
            </span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 taxi-gradient">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-taxi-dark mb-6">
            Hoziroq zakaz bering!
          </h2>
          <p className="text-taxi-dark/80 mb-8 max-w-xl mx-auto">
            Telegram botimiz orqali bir necha soniyada taxi zakaz qiling
          </p>
          <Button 
            size="lg" 
            className="taxi-btn-primary text-lg px-10 py-6 rounded-xl shadow-xl"
            onClick={() => window.open(telegramBotUrl, "_blank")}
          >
            <MessageCircle className="mr-2 h-6 w-6" />
            Telegram Bot ga o'tish
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card py-12 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <Car className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold">Toshkent Xorazm Taxi</span>
            </div>
            
            <div className="flex items-center gap-6 text-muted-foreground">
              <a href="tel:+998975002086" className="hover:text-foreground transition-colors">
                📞 +998 97 500 20 86
              </a>
              <a href="https://t.me/Sherzod_2086" target="_blank" rel="noopener" className="hover:text-foreground transition-colors">
                📲 @Sherzod_2086
              </a>
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t border-border text-center text-muted-foreground text-sm">
            © 2026 Toshkent Xorazm Taxi. Barcha huquqlar himoyalangan.
          </div>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="taxi-card p-6 text-center hover:shadow-xl transition-shadow">
    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full taxi-gradient mb-4">
      <div className="text-taxi-dark">{icon}</div>
    </div>
    <h3 className="text-lg font-semibold mb-2">{title}</h3>
    <p className="text-muted-foreground text-sm">{description}</p>
  </div>
);

const ServiceCard = ({ icon, title, description, onClick }: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) => (
  <div 
    className="taxi-card p-8 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
    onClick={onClick}
  >
    <div className="mb-4">{icon}</div>
    <h3 className="text-xl font-semibold mb-3">{title}</h3>
    <p className="text-muted-foreground">{description}</p>
  </div>
);

export default Index;
