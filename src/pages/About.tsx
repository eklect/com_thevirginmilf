import { Helmet } from "react-helmet";

const About = () => {
  return (
    <>
      <Helmet>
        <title>About - The Virgin Milf | Ali Mucci</title>
        <meta name="description" content="Learn about Ali Mucci, The Virgin Milf - a mother of 4 who is getting into gaming for the first time." />
      </Helmet>
      
      <div className="min-h-screen pt-20 bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
              About Virgin MILF
            </h1>
            <div className="w-24 h-1 bg-gradient-to-r from-primary to-accent mx-auto" />
          </div>

          {/* Content */}
          <div className="space-y-8 text-lg leading-relaxed">
            <div className="bg-card border border-border rounded-2xl p-8 md:p-12 shadow-lg hover:shadow-xl transition-shadow duration-300">
              <p className="text-foreground mb-6">
                <span className="text-primary font-bold">Virgin MILF</span> is the official site of <span className="font-semibold">Ali Mucci</span>, who is a new streamer and gamer. She is a mother of 4 and is getting into playing video games for the first time in her life.
              </p>
              
              <p className="text-foreground mb-6">
                Since this is her first time gaming, she is a <span className="text-primary font-bold">Virgin</span>. She is also a <span className="text-primary font-bold">MILF</span>, so there is that.
              </p>
              
              <div className="bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 rounded-xl p-8 mt-8">
                <p className="text-foreground mb-4">
                  If any of your kids asks about MILFs, say it stands for:
                </p>
                
                <div className="text-2xl md:text-3xl font-bold text-center space-y-2">
                  <div className="flex items-center justify-center space-x-3">
                    <span className="text-primary text-4xl">M</span>
                    <span className="text-foreground">om</span>
                  </div>
                  <div className="flex items-center justify-center space-x-3">
                    <span className="text-primary text-4xl">I</span>
                  </div>
                  <div className="flex items-center justify-center space-x-3">
                    <span className="text-primary text-4xl">L</span>
                    <span className="text-foreground">ike</span>
                  </div>
                  <div className="flex items-center justify-center space-x-3">
                    <span className="text-primary text-4xl">F</span>
                    <span className="text-foreground">un!</span>
                  </div>
                </div>
                
                <p className="text-center text-4xl mt-6">:D</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default About;
