import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Users, Calendar, CheckSquare, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";

const Index = () => {
  const navigate = useNavigate();
  const [currentWord, setCurrentWord] = useState(0);
  const words = ["Weekly", "Monthly", "Quarterly", "Daily"];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWord((prev) => (prev + 1) % words.length);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Tactical Mastery
          </h1>
          <Button onClick={() => navigate("/auth")}>
            Get Started
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-5xl font-bold tracking-tight">
              Transform Your Team's
              <span className="block bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                <span 
                  key={currentWord}
                  className="inline-block animate-in fade-in-0 duration-500"
                >
                  {words[currentWord]}
                </span> Meetings
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Streamline your tactical meetings with collaborative agenda tracking,
              action items, and team accountability.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="text-lg h-14 px-8"
              onClick={() => navigate("/auth")}
            >
              Start Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg h-14 px-8"
              onClick={() => navigate("/auth")}
            >
              Sign In
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-8 pt-16">
            <div className="p-6 rounded-lg bg-card border border-border/50 hover:shadow-large transition-all">
              <div className="rounded-full bg-primary/10 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Team Collaboration</h3>
              <p className="text-muted-foreground">
                Invite team members and collaborate in real-time on meeting agendas and topics
              </p>
            </div>

            <div className="p-6 rounded-lg bg-card border border-border/50 hover:shadow-large transition-all">
              <div className="rounded-full bg-primary/10 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Weekly Tracking</h3>
              <p className="text-muted-foreground">
                Automatically organize meetings by week and track progress over time
              </p>
            </div>

            <div className="p-6 rounded-lg bg-card border border-border/50 hover:shadow-large transition-all">
              <div className="rounded-full bg-primary/10 w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <CheckSquare className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Action Items</h3>
              <p className="text-muted-foreground">
                Assign tasks, set time estimates, and track completion with ease
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t mt-20">
        <div className="container mx-auto px-4 py-6 text-center text-muted-foreground">
          <p>&copy; 2025 Wikli Inc. Built for productive teams.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
