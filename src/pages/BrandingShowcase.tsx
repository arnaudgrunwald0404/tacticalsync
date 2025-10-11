import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

const BrandingShowcase = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const brandingOptions = [
    {
      name: "Linear Elegance",
      className: "text-6xl font-light tracking-tight bg-gradient-to-r from-blue-600 via-pink-500 to-blue-600 bg-clip-text text-transparent",
      description: "Clean, minimal, sophisticated gradient"
    },
    {
      name: "Bold Stripe",
      className: "text-6xl font-bold bg-gradient-to-br from-blue-500 to-pink-600 bg-clip-text text-transparent",
      description: "Professional and confident"
    },
    {
      name: "Vercel Sharp",
      className: "text-6xl font-black tracking-tighter bg-gradient-to-r from-pink-500 via-blue-600 to-pink-500 bg-clip-text text-transparent",
      description: "Ultra-modern and edgy"
    },
    {
      name: "Notion Calm",
      className: "text-6xl font-medium text-blue-600",
      style: { textShadow: "2px 2px 0px #ec4899" },
      description: "Minimalist with pink shadow"
    },
    {
      name: "Figma Playful",
      className: "text-6xl font-bold text-blue-500",
      style: { 
        textShadow: "3px 3px 0px #ec4899, 6px 6px 0px #60a5fa",
        transform: "rotate(-2deg)"
      },
      description: "Fun and creative"
    },
    {
      name: "Discord Vibrant",
      className: "text-6xl font-extrabold bg-gradient-to-r from-pink-400 via-blue-500 to-pink-400 bg-clip-text text-transparent animate-pulse",
      description: "Energetic and alive"
    },
    {
      name: "Airbnb Friendly",
      className: "text-6xl font-semibold tracking-wide text-blue-600",
      style: { 
        textShadow: "0 4px 0 #ec4899, 0 8px 20px rgba(236, 72, 153, 0.3)"
      },
      description: "Warm with pink depth"
    },
    {
      name: "Spotify Bold",
      className: "text-6xl font-black italic bg-gradient-to-r from-pink-600 to-blue-600 bg-clip-text text-transparent",
      description: "Dynamic and powerful"
    },
    {
      name: "Slack Modern",
      className: "text-6xl font-bold text-blue-700",
      style: {
        background: "linear-gradient(135deg, #3b82f6 0%, #ec4899 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        filter: "drop-shadow(0 2px 8px rgba(236, 72, 153, 0.3))"
      },
      description: "Professional with soft glow"
    },
    {
      name: "Dropbox Clean",
      className: "text-6xl font-semibold tracking-tight",
      style: {
        background: "linear-gradient(to right, #60a5fa, #ec4899, #3b82f6)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text"
      },
      description: "Smooth tri-color flow"
    },
    {
      name: "GitHub Tech",
      className: "text-6xl font-mono font-bold text-blue-600 border-b-4 border-pink-500",
      description: "Technical and precise"
    },
    {
      name: "Twitch Energy",
      className: "text-6xl font-black tracking-wider",
      style: {
        color: "#3b82f6",
        textShadow: "2px 2px #ec4899, 4px 4px #60a5fa, 6px 6px #f472b6"
      },
      description: "High energy layered"
    },
    {
      name: "Dribbble Creative",
      className: "text-6xl font-bold",
      style: {
        background: "linear-gradient(45deg, #ec4899 0%, #3b82f6 50%, #ec4899 100%)",
        backgroundSize: "200% 200%",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        animation: "gradient 3s ease infinite"
      },
      description: "Animated gradient wave"
    },
    {
      name: "Apple Refined",
      className: "text-6xl font-light tracking-tight text-blue-900",
      style: {
        textShadow: "0 1px 0 #ec4899, 0 2px 0 rgba(236, 72, 153, 0.5)"
      },
      description: "Elegant and premium"
    },
    {
      name: "Netflix Impact",
      className: "text-6xl font-black uppercase",
      style: {
        background: "linear-gradient(180deg, #3b82f6 0%, #ec4899 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        letterSpacing: "0.05em"
      },
      description: "Strong vertical gradient"
    },
    {
      name: "Shopify Commerce",
      className: "text-6xl font-bold",
      style: {
        color: "#3b82f6",
        WebkitTextStroke: "2px #ec4899"
      },
      description: "Blue fill with pink outline"
    },
    {
      name: "Asana Flow",
      className: "text-6xl font-medium tracking-wide",
      style: {
        background: "linear-gradient(90deg, #60a5fa 0%, #f472b6 25%, #60a5fa 50%, #f472b6 75%, #60a5fa 100%)",
        backgroundSize: "200% auto",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text"
      },
      description: "Multi-stripe pattern"
    },
    {
      name: "Zendesk Soft",
      className: "text-6xl font-semibold",
      style: {
        background: "radial-gradient(circle, #ec4899 0%, #3b82f6 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text"
      },
      description: "Radial gradient center out"
    },
    {
      name: "Uber Edge",
      className: "text-6xl font-black tracking-tighter",
      style: {
        color: "transparent",
        WebkitTextStroke: "1px #3b82f6",
        textShadow: "3px 3px 0px #ec4899"
      },
      description: "Outlined with shadow"
    },
    {
      name: "Canva Bright",
      className: "text-6xl font-extrabold",
      style: {
        background: "linear-gradient(135deg, #f472b6 0%, #60a5fa 50%, #ec4899 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        filter: "drop-shadow(0 0 20px rgba(236, 72, 153, 0.5))"
      },
      description: "Bright with pink glow"
    }
  ];

  const copyStyles = (index: number, option: any) => {
    const styleString = `className: "${option.className}"\nstyle: ${JSON.stringify(option.style, null, 2)}`;
    navigator.clipboard.writeText(styleString);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-pink-50 p-8">
      <style>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
      
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-pink-600 bg-clip-text text-transparent">
            TacticalSync Branding Options
          </h1>
          <p className="text-xl text-gray-600">
            Choose your favorite style • 20 unique options combining pink & blue
          </p>
        </div>

        <div className="grid gap-8">
          {brandingOptions.map((option, index) => (
            <Card key={index} className="p-8 hover:shadow-2xl transition-all border-2 hover:border-blue-200">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{index + 1}. {option.name}</h3>
                  <p className="text-sm text-gray-500">{option.description}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyStyles(index, option)}
                  className="gap-2"
                >
                  {copiedIndex === index ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Styles
                    </>
                  )}
                </Button>
              </div>
              
              <div className="flex items-center justify-center py-12 bg-white rounded-lg">
                <div 
                  className={option.className}
                  style={option.style}
                >
                  TacticalSync
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="text-center py-8">
          <p className="text-gray-600">
            Click "Copy Styles" on your favorite option to get the CSS code
          </p>
        </div>
      </div>
    </div>
  );
};

export default BrandingShowcase;
