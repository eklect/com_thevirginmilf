import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Twitch, Youtube } from "lucide-react";

const Streaming = () => {
  const [activeTab, setActiveTab] = useState("twitch");

  // Replace with actual channel usernames
  const twitchChannel = "thevirginmilf";
  const youtubeChannelId = "UCqKN_wYjLXe4Q2tZkXxZWUg"; // Replace with actual channel ID

  return (
    <div className="min-h-screen bg-background py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-5xl sm:text-6xl font-bold text-center mb-4 bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
          Live Streams
        </h1>
        <p className="text-center text-muted-foreground mb-12 text-lg">
          Watch live gameplay and join the community!
        </p>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8 bg-card border border-border h-14">
            <TabsTrigger 
              value="twitch" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-lg"
            >
              <Twitch className="mr-2 h-5 w-5" />
              Twitch
            </TabsTrigger>
            <TabsTrigger 
              value="youtube"
              className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground text-lg"
            >
              <Youtube className="mr-2 h-5 w-5" />
              YouTube
            </TabsTrigger>
          </TabsList>

          <TabsContent value="twitch" className="mt-0">
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl hover:border-primary/50 transition-colors duration-500">
              <div className="aspect-video w-full">
                <iframe
                  src={`https://player.twitch.tv/?channel=${twitchChannel}&parent=${window.location.hostname}`}
                  height="100%"
                  width="100%"
                  allowFullScreen
                  className="w-full h-full"
                  title="Twitch Stream"
                />
              </div>
              <div className="p-6 bg-card/50 backdrop-blur-sm">
                <h3 className="text-2xl font-bold mb-2 text-foreground">Twitch Chat</h3>
                <div className="aspect-[16/9] sm:aspect-video">
                  <iframe
                    src={`https://www.twitch.tv/embed/${twitchChannel}/chat?parent=${window.location.hostname}&darkpopout`}
                    height="100%"
                    width="100%"
                    className="w-full h-full rounded-lg"
                    title="Twitch Chat"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="youtube" className="mt-0">
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl hover:border-secondary/50 transition-colors duration-500">
              <div className="aspect-video w-full">
                <iframe
                  src={`https://www.youtube.com/embed/live_stream?channel=${youtubeChannelId}&autoplay=1`}
                  height="100%"
                  width="100%"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  className="w-full h-full"
                  title="YouTube Stream"
                />
              </div>
              <div className="p-6 text-center">
                <p className="text-muted-foreground">
                  Subscribe to my YouTube channel for highlights, VODs, and exclusive content!
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Stream Schedule Section */}
        <div className="mt-16 bg-card border border-border rounded-2xl p-8 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-6 text-center bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Stream Schedule
          </h2>
          <div className="space-y-3 text-center text-muted-foreground">
            <p className="text-lg">🎮 Monday - Friday: 7 PM - 11 PM EST</p>
            <p className="text-lg">🎮 Saturday: 2 PM - 8 PM EST</p>
            <p className="text-lg">🎮 Sunday: Surprise Streams!</p>
            <p className="text-sm mt-6 text-foreground/60">
              * Schedule subject to change. Follow on social media for updates!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Streaming;
