import { Helmet } from "react-helmet";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Star, Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Mock game data
const gamesData: Record<string, any> = {
  fortnite: {
    title: "Fortnite",
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&h=600&fit=crop",
    rating: 4.5,
    review: "Fortnite has been an absolute blast to learn! The building mechanics seemed intimidating at first, but once you get the hang of it, it's incredibly satisfying. The game is constantly evolving with new seasons and events, which keeps things fresh. Playing with my kids has created some amazing family memories. The community can be intense sometimes, but Squad mode with friends is where this game truly shines!",
    pros: ["Fun building mechanics", "Regular updates", "Great for playing with family", "Free to play"],
    cons: ["Steep learning curve", "Can be competitive", "Lots of young players"],
    highlights: [
      { id: "vid1", title: "My First Victory Royale!", thumbnail: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=225&fit=crop", videoId: "dQw4w9WgXcQ" },
      { id: "vid2", title: "Epic Build Battle", thumbnail: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=225&fit=crop", videoId: "dQw4w9WgXcQ" },
      { id: "vid3", title: "Squad Wins Compilation", thumbnail: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=225&fit=crop", videoId: "dQw4w9WgXcQ" },
    ],
    clans: [
      { id: "clan1", name: "MILF Squad", role: "Owner", members: 25, description: "Family-friendly gaming community for parents" },
      { id: "clan2", name: "Late Night Gamers", role: "Member", members: 150, description: "Gaming after the kids go to bed" },
    ],
  },
  minecraft: {
    title: "Minecraft",
    image: "https://images.unsplash.com/photo-1604514628550-37477afdf4e3?w=1200&h=600&fit=crop",
    rating: 5,
    review: "Minecraft is pure creative joy! It's amazing how a game made of blocks can be so immersive and relaxing. I love the survival mode where you gather resources and build your base, but creative mode is where I spend most of my time designing elaborate builds. It's a game where your imagination is the only limit. My kids helped me learn the redstone mechanics, and now I'm building automated farms!",
    pros: ["Infinite creativity", "Relaxing gameplay", "Great for all ages", "Endless content"],
    cons: ["Graphics might not appeal to everyone", "Can be time-consuming"],
    highlights: [
      { id: "vid1", title: "Building My Dream Castle", thumbnail: "https://images.unsplash.com/photo-1604514628550-37477afdf4e3?w=400&h=225&fit=crop", videoId: "dQw4w9WgXcQ" },
      { id: "vid2", title: "First Night Survival", thumbnail: "https://images.unsplash.com/photo-1604514628550-37477afdf4e3?w=400&h=225&fit=crop", videoId: "dQw4w9WgXcQ" },
      { id: "vid3", title: "Redstone Farm Tutorial", thumbnail: "https://images.unsplash.com/photo-1604514628550-37477afdf4e3?w=400&h=225&fit=crop", videoId: "dQw4w9WgXcQ" },
    ],
    clans: [
      { id: "clan1", name: "Block Builders United", role: "Owner", members: 45, description: "Creative builders who love to collaborate" },
      { id: "clan2", name: "Mom's Mining Crew", role: "Co-Owner", members: 30, description: "Parent gamers mining together" },
      { id: "clan3", name: "Redstone Engineers", role: "Member", members: 200, description: "Advanced redstone mechanics community" },
    ],
  },
  "animal-crossing": {
    title: "Animal Crossing",
    image: "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=1200&h=600&fit=crop",
    rating: 4,
    review: "Animal Crossing is my zen game. After a stressful day, there's nothing better than tending to my island, decorating my house, and chatting with adorable animal villagers. The real-time gameplay means there's always something new happening, and the seasonal events keep me coming back. It's the perfect game to play in short bursts or long relaxing sessions.",
    pros: ["Extremely relaxing", "Cute art style", "Daily rewards", "No pressure gameplay"],
    cons: ["Slow paced", "Requires real-time waiting", "Limited multiplayer features"],
    highlights: [
      { id: "vid1", title: "Island Tour", thumbnail: "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=400&h=225&fit=crop", videoId: "dQw4w9WgXcQ" },
      { id: "vid2", title: "Dream House Reveal", thumbnail: "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=400&h=225&fit=crop", videoId: "dQw4w9WgXcQ" },
    ],
    clans: [
      { id: "clan1", name: "Cozy Island Collective", role: "Member", members: 60, description: "Relaxed players sharing island designs" },
    ],
  },
};

const GameDetails = () => {
  const { gameId } = useParams();
  const game = gameId ? gamesData[gameId] : null;

  if (!game) {
    return (
      <div className="min-h-screen pt-20 bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">Game Not Found</h1>
          <Link to="/games" className="text-primary hover:underline">
            Back to Games
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{game.title} - The Virgin Milf | Ali Mucci</title>
        <meta name="description" content={`Ali Mucci's review and highlights for ${game.title}`} />
      </Helmet>

      <div className="min-h-screen pt-20 bg-background">
        {/* Hero Section */}
        <div className="relative h-[60vh] w-full">
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${game.image})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/30" />
          </div>
          
          <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-12">
            <Link
              to="/games"
              className="inline-flex items-center space-x-2 text-foreground/80 hover:text-primary transition-colors mb-6 w-fit"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Games</span>
            </Link>
            
            <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-4">
              {game.title}
            </h1>
            
            <div className="flex items-center space-x-2">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-7 h-7 ${
                    i < Math.floor(game.rating)
                      ? "fill-primary text-primary"
                      : "text-muted"
                  }`}
                />
              ))}
              <span className="text-foreground text-2xl ml-2">{game.rating}/5</span>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Review Section */}
          <Card className="mb-12 border-border">
            <CardContent className="p-8">
              <h2 className="text-3xl font-bold text-foreground mb-6">My Review</h2>
              <p className="text-lg text-foreground/80 leading-relaxed mb-8">
                {game.review}
              </p>
              
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xl font-bold text-primary mb-4">What I Love</h3>
                  <ul className="space-y-2">
                    {game.pros.map((pro: string, index: number) => (
                      <li key={index} className="flex items-start space-x-2 text-foreground/80">
                        <span className="text-primary mt-1">✓</span>
                        <span>{pro}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-xl font-bold text-primary mb-4">Challenges</h3>
                  <ul className="space-y-2">
                    {game.cons.map((con: string, index: number) => (
                      <li key={index} className="flex items-start space-x-2 text-foreground/80">
                        <span className="text-primary mt-1">−</span>
                        <span>{con}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Video Highlights Section */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-6">Video Highlights</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {game.highlights.map((video: any) => (
                <a
                  key={video.id}
                  href={`https://youtube.com/watch?v=${video.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group"
                >
                  <Card className="overflow-hidden border-border hover:border-primary/50 transition-all duration-300 hover:scale-105">
                    <div className="relative aspect-video">
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                          <Play className="w-8 h-8 text-primary-foreground ml-1" />
                        </div>
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {video.title}
                      </h3>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          </div>

          {/* Clans & Clubs Section */}
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-6">Gaming Clans & Clubs</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {game.clans.map((clan: any) => (
                <Card key={clan.id} className="border-border hover:border-primary/50 transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-xl font-bold text-foreground">{clan.name}</h3>
                      <span className="px-3 py-1 bg-primary/10 text-primary text-sm font-semibold rounded-full">
                        {clan.role}
                      </span>
                    </div>
                    <p className="text-foreground/70 mb-4">{clan.description}</p>
                    <div className="flex items-center text-sm text-foreground/60">
                      <span>{clan.members} members</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default GameDetails;
