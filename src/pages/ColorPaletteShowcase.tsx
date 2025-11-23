import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertTriangle, TrendingUp, Target, Calendar, User } from "lucide-react";

// Color definitions based on the brand guidelines
const primaryColors = {
  white: {
    name: "White",
    hex: "#FFFFFF",
    rgb: "255, 255, 255",
    bg: "bg-white",
    text: "text-gray-900",
    border: "border-gray-200",
  },
  platinum: {
    name: "Platinum",
    hex: "#F5F3F0",
    rgb: "245, 243, 240",
    bg: "bg-[#F5F3F0]",
    text: "text-gray-900",
    border: "border-gray-300",
  },
  copper: {
    name: "Copper",
    hex: "#C97D60",
    rgb: "201, 125, 96",
    bg: "bg-[#C97D60]",
    text: "text-white",
    border: "border-[#B86A4F]",
  },
  titanium: {
    name: "Titanium",
    hex: "#4A5D5F",
    rgb: "74, 93, 95",
    bg: "bg-[#4A5D5F]",
    text: "text-white",
    border: "border-[#3A4D4F]",
  },
};

const secondaryColors = {
  roseGold: {
    name: "Rose Gold",
    hex: "#E8B4A0",
    rgb: "232, 180, 160",
    bg: "bg-[#E8B4A0]",
    text: "text-gray-900",
    border: "border-[#D8A490]",
  },
  bronze: {
    name: "Bronze",
    hex: "#8B6F47",
    rgb: "139, 111, 71",
    bg: "bg-[#8B6F47]",
    text: "text-white",
    border: "border-[#7B5F37]",
  },
  verdigris: {
    name: "Verdigris",
    hex: "#6B9A8F",
    rgb: "107, 154, 143",
    bg: "bg-[#6B9A8F]",
    text: "text-white",
    border: "border-[#5B8A7F]",
  },
  steel: {
    name: "Steel",
    hex: "#5B6E7A",
    rgb: "91, 110, 122",
    bg: "bg-[#5B6E7A]",
    text: "text-white",
    border: "border-[#4B5E6A]",
  },
  pewter: {
    name: "Pewter",
    hex: "#9FA8B3",
    rgb: "159, 168, 179",
    bg: "bg-[#9FA8B3]",
    text: "text-gray-900",
    border: "border-[#8F98A3]",
  },
  whiteGold: {
    name: "White Gold",
    hex: "#F8F6F2",
    rgb: "248, 246, 242",
    bg: "bg-[#F8F6F2]",
    text: "text-gray-900",
    border: "border-gray-300",
  },
  brass: {
    name: "Brass",
    hex: "#B89A6B",
    rgb: "184, 154, 107",
    bg: "bg-[#B89A6B]",
    text: "text-gray-900",
    border: "border-[#A88A5B]",
  },
  castIron: {
    name: "Cast Iron",
    hex: "#2C2C2C",
    rgb: "44, 44, 44",
    bg: "bg-[#2C2C2C]",
    text: "text-white",
    border: "border-[#1C1C1C]",
    note: "Reserved for text and logo only — not for backgrounds or graphic elements",
  },
};

const ColorPaletteShowcase = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F3F0] via-white to-[#F8F6F2] p-4 sm:p-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Public+Sans:wght@300;400;500;600;700&display=swap');
        
        .font-heading {
          font-family: 'Atkinson Hyperlegible', sans-serif;
        }
        
        .font-body {
          font-family: 'Public Sans', sans-serif;
        }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <h1 className="font-heading text-4xl sm:text-5xl font-bold text-[#2C2C2C]">
            Color Palette Reflection
          </h1>
          <p className="font-body text-lg text-[#4A5D5F] max-w-2xl mx-auto">
            Exploring how our metal-themed color palette works across different UI elements and contexts
          </p>
        </div>

        <Tabs defaultValue="primary" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="primary" className="font-body">Primary Colors</TabsTrigger>
            <TabsTrigger value="secondary" className="font-body">Secondary Colors</TabsTrigger>
            <TabsTrigger value="components" className="font-body">Component Examples</TabsTrigger>
          </TabsList>

          {/* Primary Colors Tab */}
          <TabsContent value="primary" className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(primaryColors).map(([key, color]) => (
                <Card
                  key={key}
                  className={`${color.bg} ${color.text} border-2 ${color.border} shadow-lg`}
                >
                  <CardHeader>
                    <CardTitle className="font-heading text-2xl">{color.name}</CardTitle>
                    <CardDescription className={color.text === "text-white" ? "text-white/80" : "text-gray-700"}>
                      Primary Color
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium opacity-90">HEX: {color.hex}</p>
                      <p className="text-sm font-medium opacity-90">RGB: {color.rgb}</p>
                    </div>
                    <div className="pt-4 border-t border-current/20">
                      <p className="text-sm opacity-80">
                        {color.name === "White" && "Pure base color for backgrounds and negative space"}
                        {color.name === "Platinum" && "Subtle neutral for secondary backgrounds"}
                        {color.name === "Copper" && "Warm accent for highlights and CTAs"}
                        {color.name === "Titanium" && "Deep tone for primary text and emphasis"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Secondary Colors Tab */}
          <TabsContent value="secondary" className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(secondaryColors).map(([key, color]) => (
                <Card
                  key={key}
                  className={`${color.bg} ${color.text} border-2 ${color.border} shadow-md`}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="font-heading text-lg">{color.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-xs space-y-1">
                      <p className="font-medium opacity-90">HEX: {color.hex}</p>
                      <p className="font-medium opacity-90">RGB: {color.rgb}</p>
                    </div>
                    {color.note && (
                      <div className="pt-2 border-t border-current/20">
                        <p className="text-xs opacity-80 italic">{color.note}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Component Examples Tab */}
          <TabsContent value="components" className="space-y-8">
            {/* Buttons Section */}
            <section className="space-y-4">
              <h2 className="font-heading text-2xl font-bold text-[#2C2C2C]">Buttons</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-6 bg-white">
                  <h3 className="font-body text-sm font-semibold mb-3 text-gray-700">Primary (Copper)</h3>
                  <Button className="w-full bg-[#C97D60] hover:bg-[#B86A4F] text-white">
                    Primary Action
                  </Button>
                </Card>
                <Card className="p-6 bg-white">
                  <h3 className="font-body text-sm font-semibold mb-3 text-gray-700">Secondary (Titanium)</h3>
                  <Button className="w-full bg-[#4A5D5F] hover:bg-[#3A4D4F] text-white">
                    Secondary Action
                  </Button>
                </Card>
                <Card className="p-6 bg-white">
                  <h3 className="font-body text-sm font-semibold mb-3 text-gray-700">Accent (Verdigris)</h3>
                  <Button className="w-full bg-[#6B9A8F] hover:bg-[#5B8A7F] text-white">
                    Accent Action
                  </Button>
                </Card>
                <Card className="p-6 bg-white">
                  <h3 className="font-body text-sm font-semibold mb-3 text-gray-700">Outline</h3>
                  <Button variant="outline" className="w-full border-2 border-[#C97D60] text-[#C97D60] hover:bg-[#C97D60]/10">
                    Outline Button
                  </Button>
                </Card>
              </div>
            </section>

            {/* Badges Section */}
            <section className="space-y-4">
              <h2 className="font-heading text-2xl font-bold text-[#2C2C2C]">Badges & Status</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-6 bg-white">
                  <h3 className="font-body text-sm font-semibold mb-3 text-gray-700">Status Badges</h3>
                  <div className="space-y-2">
                    <Badge className="bg-[#6B9A8F] text-white">On Track</Badge>
                    <Badge className="bg-[#B89A6B] text-gray-900">In Progress</Badge>
                    <Badge className="bg-[#8B6F47] text-white">At Risk</Badge>
                    <Badge className="bg-[#5B6E7A] text-white">Completed</Badge>
                  </div>
                </Card>
                <Card className="p-6 bg-white">
                  <h3 className="font-body text-sm font-semibold mb-3 text-gray-700">Health Indicators</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#6B9A8F]" />
                      <span className="font-body text-sm">Healthy</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-[#B89A6B]" />
                      <span className="font-body text-sm">Warning</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-[#8B6F47]" />
                      <span className="font-body text-sm">Improving</span>
                    </div>
                  </div>
                </Card>
                <Card className="p-6 bg-white">
                  <h3 className="font-body text-sm font-semibold mb-3 text-gray-700">Progress Bars</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-body">Progress</span>
                        <span className="font-body">75%</span>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#F5F3F0]">
                        <div 
                          className="h-full bg-[#C97D60] transition-all"
                          style={{ width: '75%' }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-body">Confidence</span>
                        <span className="font-body">60%</span>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#F5F3F0]">
                        <div 
                          className="h-full bg-[#6B9A8F] transition-all"
                          style={{ width: '60%' }}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
                <Card className="p-6 bg-white">
                  <h3 className="font-body text-sm font-semibold mb-3 text-gray-700">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-[#C97D60] text-[#C97D60]">Priority</Badge>
                    <Badge variant="outline" className="border-[#6B9A8F] text-[#6B9A8F]">Strategic</Badge>
                    <Badge variant="outline" className="border-[#5B6E7A] text-[#5B6E7A]">Tactical</Badge>
                  </div>
                </Card>
              </div>
            </section>

            {/* Cards Section */}
            <section className="space-y-4">
              <h2 className="font-heading text-2xl font-bold text-[#2C2C2C]">Card Variations</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* DO Tile Style */}
                <Card className="border-l-4 border-l-[#C97D60] hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="font-heading text-lg">Defining Objective</CardTitle>
                      <Badge className="bg-[#6B9A8F] text-white">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        On Track
                      </Badge>
                    </div>
                    <CardDescription className="font-body">
                      Example of a DO tile with copper accent
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-body text-gray-600">Confidence</span>
                        <span className="font-body font-semibold">85%</span>
                      </div>
                      <Progress value={85} className="h-2" />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-gray-500" />
                      <span className="font-body text-gray-700">Owner Name</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Initiative Card Style */}
                <Card className="hover:shadow-md transition-all bg-gradient-to-br from-white to-[#F8F6F2]">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="font-heading text-lg">Strategic Initiative</CardTitle>
                      <Badge className="bg-[#5B6E7A] text-white">Active</Badge>
                    </div>
                    <CardDescription className="font-body">
                      Initiative card with subtle gradient
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="h-4 w-4" />
                      <span className="font-body">Jan 15 - Mar 30, 2024</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Metric Card Style */}
                <Card className="bg-[#4A5D5F] text-white border-2 border-[#3A4D4F]">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Key Metric
                    </CardTitle>
                    <CardDescription className="text-white/80 font-body">
                      Titanium background card
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-heading mb-2">1,234</div>
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4" />
                      <span className="font-body">+12% from last period</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Forms Section */}
            <section className="space-y-4">
              <h2 className="font-heading text-2xl font-bold text-[#2C2C2C]">Form Elements</h2>
              <Card className="p-6 bg-white">
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="font-body">Name</Label>
                    <Input
                      id="name"
                      placeholder="Enter your name"
                      className="font-body border-2 focus:border-[#C97D60]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="font-body">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      className="font-body border-2 focus:border-[#C97D60]"
                    />
                  </div>
                  <Button className="w-full bg-[#C97D60] hover:bg-[#B86A4F] text-white font-body">
                    Submit Form
                  </Button>
                </div>
              </Card>
            </section>

            {/* Typography Section */}
            <section className="space-y-4">
              <h2 className="font-heading text-2xl font-bold text-[#2C2C2C]">Typography</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6 bg-white">
                  <h3 className="font-heading text-lg font-bold mb-4 text-[#2C2C2C]">Headings (Atkinson Hyperlegible)</h3>
                  <div className="space-y-3">
                    <h1 className="font-heading text-4xl font-bold text-[#2C2C2C]">Heading 1</h1>
                    <h2 className="font-heading text-3xl font-bold text-[#4A5D5F]">Heading 2</h2>
                    <h3 className="font-heading text-2xl font-bold text-[#4A5D5F]">Heading 3</h3>
                    <h4 className="font-heading text-xl font-bold text-[#4A5D5F]">Heading 4</h4>
                  </div>
                </Card>
                <Card className="p-6 bg-white">
                  <h3 className="font-heading text-lg font-bold mb-4 text-[#2C2C2C]">Body Text (Public Sans)</h3>
                  <div className="space-y-3 font-body">
                    <p className="text-base text-[#4A5D5F]">
                      Regular body text for paragraphs and descriptions. This font is optimized for readability.
                    </p>
                    <p className="text-sm text-[#5B6E7A]">
                      Smaller text for captions and secondary information.
                    </p>
                    <p className="text-lg font-semibold text-[#2C2C2C]">
                      Emphasized text with semibold weight.
                    </p>
                  </div>
                </Card>
              </div>
            </section>

            {/* Color Combinations */}
            <section className="space-y-4">
              <h2 className="font-heading text-2xl font-bold text-[#2C2C2C]">Color Combinations</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-gradient-to-br from-[#C97D60] to-[#B86A4F] text-white border-0">
                  <CardHeader>
                    <CardTitle className="font-heading text-xl">Copper Gradient</CardTitle>
                    <CardDescription className="text-white/90 font-body">
                      Warm, inviting gradient for hero sections
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-gradient-to-br from-[#4A5D5F] to-[#3A4D4F] text-white border-0">
                  <CardHeader>
                    <CardTitle className="font-heading text-xl">Titanium Gradient</CardTitle>
                    <CardDescription className="text-white/90 font-body">
                      Deep, professional gradient for emphasis
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-gradient-to-br from-[#6B9A8F] to-[#5B8A7F] text-white border-0">
                  <CardHeader>
                    <CardTitle className="font-heading text-xl">Verdigris Gradient</CardTitle>
                    <CardDescription className="text-white/90 font-body">
                      Calm, balanced gradient for secondary sections
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card className="bg-gradient-to-br from-[#F5F3F0] via-white to-[#F8F6F2] text-[#2C2C2C] border-2 border-[#E8B4A0]">
                  <CardHeader>
                    <CardTitle className="font-heading text-xl">Neutral Gradient</CardTitle>
                    <CardDescription className="text-[#4A5D5F] font-body">
                      Subtle background gradient using platinum and white gold
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ColorPaletteShowcase;

