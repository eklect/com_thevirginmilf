import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Twitch, Youtube, ExternalLink } from "lucide-react";
import logo from "@/assets/logo.png";

const Home = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-primary/5 animate-pulse" 
             style={{ animationDuration: "8s" }} />
        
        {/* Glow effects */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse" 
             style={{ animationDuration: "6s" }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/15 rounded-full blur-[120px] animate-pulse" 
             style={{ animationDuration: "7s", animationDelay: "1s" }} />

        <div className="relative z-10 text-center max-w-4xl mx-auto">
          <img 
            src={logo} 
            alt="The Virgin Milf" 
            className="w-64 h-auto mx-auto mb-8 drop-shadow-[0_0_50px_rgba(255,0,0,0.5)] hover:drop-shadow-[0_0_80px_rgba(255,0,0,0.8)] transition-all duration-500" 
          />
          
          <h1 className="text-6xl sm:text-7xl md:text-8xl font-black mb-6 bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
            The Virgin Milf
          </h1>
          
          <p className="text-xl sm:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
            Professional gamer, streamer, and content creator bringing you epic gameplay, 
            unforgettable moments, and a community like no other.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link to="/streaming">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-primary to-accent hover:shadow-[0_0_30px_rgba(255,0,0,0.6)] transition-all duration-300 text-lg px-8 py-6"
              >
                <Twitch className="mr-2 h-5 w-5" />
                Watch Live
              </Button>
            </Link>
            
            <Link to="/links">
              <Button 
                variant="outline" 
                size="lg"
                className="border-2 border-foreground text-foreground hover:bg-foreground/10 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-all duration-300 text-lg px-8 py-6"
              >
                <ExternalLink className="mr-2 h-5 w-5" />
                Connect With Me
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-24 px-4 relative">
        <div className="max-w-4xl mx-auto">
          <div className="bg-card border border-border rounded-2xl p-8 sm:p-12 backdrop-blur-sm hover:border-primary/50 transition-colors duration-500">
            <h2 className="text-4xl sm:text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              About Me
            </h2>
            <div className="space-y-4 text-lg text-muted-foreground leading-relaxed">
              <p>
                Welcome to my corner of the internet! I'm a passionate gamer and content creator 
                who loves bringing entertainment and building a vibrant community.
              </p>
              <p>
                Whether I'm dominating in competitive matches or exploring new game worlds, 
                I'm all about creating memorable experiences and connecting with amazing people.
              </p>
              <p className="flex items-center gap-2 text-foreground font-semibold">
                <Twitch className="h-5 w-5 text-primary" />
                Catch me live on Twitch
                <span className="mx-2">•</span>
                <Youtube className="h-5 w-5 text-primary" />
                Subscribe on YouTube
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
