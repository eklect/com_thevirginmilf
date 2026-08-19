import { Button } from "@/components/ui/button";
import { 
  Youtube, 
  Twitter, 
  Instagram, 
  Twitch,
  Github,
  Mail,
  ExternalLink
} from "lucide-react";
import logo from "@/assets/logo.png";

const Links = () => {
  const socialLinks = [
    {
      name: "Twitch",
      icon: Twitch,
      url: "https://twitch.tv/thevirginmilf",
      color: "from-purple-500 to-purple-700",
      description: "Watch me live!"
    },
    {
      name: "YouTube",
      icon: Youtube,
      url: "https://youtube.com/@thevirginmilf",
      color: "from-red-500 to-red-700",
      description: "Subscribe for highlights & VODs"
    },
    {
      name: "Twitter/X",
      icon: Twitter,
      url: "https://twitter.com/thevirginmilf",
      color: "from-sky-400 to-sky-600",
      description: "Latest updates & thoughts"
    },
    {
      name: "Instagram",
      icon: Instagram,
      url: "https://instagram.com/thevirginmilf",
      color: "from-pink-500 via-purple-500 to-orange-500",
      description: "Behind the scenes"
    },
    {
      name: "Discord",
      icon: Github,
      url: "https://discord.gg/thevirginmilf",
      color: "from-indigo-500 to-indigo-700",
      description: "Join the community"
    },
    {
      name: "Email",
      icon: Mail,
      url: "mailto:contact@thevirginmilf.com",
      color: "from-gray-600 to-gray-800",
      description: "Business inquiries"
    },
  ];

  return (
    <div className="min-h-screen bg-background py-24 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <img 
            src={logo} 
            alt="The Virgin Milf" 
            className="w-32 h-auto mx-auto mb-6 drop-shadow-[0_0_30px_rgba(255,0,0,0.5)]" 
          />
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            Connect With Me
          </h1>
          <p className="text-muted-foreground text-lg">
            Follow me across all platforms and join the community!
          </p>
        </div>

        {/* Social Links */}
        <div className="space-y-4">
          {socialLinks.map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,0,0,0.2)] hover:scale-[1.02]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`p-3 rounded-lg bg-gradient-to-br ${link.color} shadow-lg`}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                          {link.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {link.description}
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </a>
            );
          })}
        </div>

        {/* Call to Action */}
        <div className="mt-12 text-center bg-card border border-border rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-3 text-foreground">
            Want to Collaborate?
          </h2>
          <p className="text-muted-foreground mb-6">
            I'm always open to exciting opportunities and partnerships!
          </p>
          <a href="mailto:contact@thevirginmilf.com">
            <Button 
              size="lg"
              className="bg-gradient-to-r from-primary to-accent hover:shadow-[0_0_30px_rgba(255,0,0,0.6)] transition-all duration-300"
            >
              <Mail className="mr-2 h-5 w-5" />
              Get In Touch
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
};

export default Links;
