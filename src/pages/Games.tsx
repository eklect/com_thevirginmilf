import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { Play, Star } from "lucide-react";

// Mock game data
const featuredGame = {
  id: "fortnite",
  title: "Fortnite",
  image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&h=600&fit=crop",
  rating: 4.5,
  description: "My go-to battle royale game! Love the building mechanics.",
};

const currentlyPlaying = [
  {
    id: "minecraft",
    title: "Minecraft",
    image: "https://images.unsplash.com/photo-1604514628550-37477afdf4e3?w=400&h=600&fit=crop",
    rating: 5,
  },
  {
    id: "fortnite",
    title: "Fortnite",
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=600&fit=crop",
    rating: 4.5,
  },
  {
    id: "animal-crossing",
    title: "Animal Crossing",
    image: "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=400&h=600&fit=crop",
    rating: 4,
  },
  {
    id: "mario-kart",
    title: "Mario Kart",
    image: "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=400&h=600&fit=crop",
    rating: 4.5,
  },
];

const favoriteGames = [
  {
    id: "zelda",
    title: "Zelda: Breath of the Wild",
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=600&fit=crop",
    rating: 5,
  },
  {
    id: "stardew-valley",
    title: "Stardew Valley",
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&h=600&fit=crop",
    rating: 5,
  },
  {
    id: "sims",
    title: "The Sims",
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=600&fit=crop",
    rating: 4.5,
  },
  {
    id: "overcooked",
    title: "Overcooked 2",
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&h=600&fit=crop",
    rating: 4,
  },
];

const Games = () => {
  return (
    <>
      <Helmet>
        <title>Games - The Virgin Milf | Ali Mucci</title>
        <meta name="description" content="Explore the games Ali Mucci is currently playing and her favorite games with reviews and ratings." />
      </Helmet>

      <div className="min-h-screen pt-20 bg-background">
        {/* Featured Game Banner */}
        <div className="relative h-[70vh] w-full mb-8">
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${featuredGame.image})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
          </div>
          
          <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center">
            <div className="max-w-2xl space-y-6">
              <h1 className="text-5xl md:text-7xl font-bold text-foreground">
                {featuredGame.title}
              </h1>
              
              <div className="flex items-center space-x-2">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-6 h-6 ${
                      i < Math.floor(featuredGame.rating)
                        ? "fill-primary text-primary"
                        : "text-muted"
                    }`}
                  />
                ))}
                <span className="text-foreground text-xl ml-2">{featuredGame.rating}/5</span>
              </div>
              
              <p className="text-xl text-foreground/80">
                {featuredGame.description}
              </p>
              
              <Link
                to={`/games/${featuredGame.id}`}
                className="inline-flex items-center space-x-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 rounded-lg text-lg font-semibold transition-all duration-300 hover:scale-105"
              >
                <Play className="w-6 h-6" />
                <span>View Details</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Currently Playing Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-6">Currently Playing</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {currentlyPlaying.map((game) => (
              <Link
                key={game.id}
                to={`/games/${game.id}`}
                className="group relative aspect-[2/3] rounded-lg overflow-hidden transition-transform duration-300 hover:scale-105 hover:z-10"
              >
                <img
                  src={game.image}
                  alt={game.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-lg font-bold text-foreground mb-2">{game.title}</h3>
                    <div className="flex items-center space-x-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < Math.floor(game.rating)
                              ? "fill-primary text-primary"
                              : "text-muted"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Favorite Games Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <h2 className="text-3xl font-bold text-foreground mb-6">Favorite Games</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {favoriteGames.map((game) => (
              <Link
                key={game.id}
                to={`/games/${game.id}`}
                className="group relative aspect-[2/3] rounded-lg overflow-hidden transition-transform duration-300 hover:scale-105 hover:z-10"
              >
                <img
                  src={game.image}
                  alt={game.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-lg font-bold text-foreground mb-2">{game.title}</h3>
                    <div className="flex items-center space-x-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < Math.floor(game.rating)
                              ? "fill-primary text-primary"
                              : "text-muted"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default Games;
