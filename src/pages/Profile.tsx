import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [redPercentage, setRedPercentage] = useState(0);
  const [bluePercentage, setBluePercentage] = useState(0);
  const [greenPercentage, setGreenPercentage] = useState(0);
  const [yellowPercentage, setYellowPercentage] = useState(0);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      setProfile(data);
      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setRedPercentage(data.red_percentage || 0);
      setBluePercentage(data.blue_percentage || 0);
      setGreenPercentage(data.green_percentage || 0);
      setYellowPercentage(data.yellow_percentage || 0);
      // Format birthday for input (without year if stored)
      if (data.birthday) {
        const date = new Date(data.birthday);
        // Store as MM-DD format (month and day only)
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        setBirthday(`${month}-${day}`);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Validate personality percentages add up to 100
      const total = redPercentage + bluePercentage + greenPercentage + yellowPercentage;
      if (total !== 0 && total !== 100) {
        toast({
          variant: "destructive",
          title: "Invalid Insight Assessment",
          description: "Personality percentages must add up to 100% (or leave all at 0)",
        });
        setSaving(false);
        return;
      }

      // Convert MM-DD to a date (using a fixed year for storage)
      let birthdayDate = null;
      if (birthday) {
        const [month, day] = birthday.split('-');
        // Use year 2000 as placeholder since we only care about month/day
        birthdayDate = `2000-${month}-${day}`;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          birthday: birthdayDate,
          red_percentage: redPercentage,
          blue_percentage: bluePercentage,
          green_percentage: greenPercentage,
          yellow_percentage: yellowPercentage,
        })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Profile updated!",
        description: "Your profile has been saved successfully.",
      });

      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Your Profile</CardTitle>
            <CardDescription>
              Update your personal information and birthday
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="flex justify-center">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={profile?.avatar_url} />
                    <AvatarFallback className="text-2xl">
                      {firstName?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute bottom-0 right-0 cursor-pointer">
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90">
                      <Upload className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        // TODO: Implement avatar upload
                        toast({
                          title: "Avatar upload",
                          description: "Avatar upload coming soon",
                        });
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthday">Birthday (Month & Day)</Label>
                <Input
                  id="birthday"
                  type="text"
                  placeholder="MM-DD (e.g., 03-15)"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  pattern="(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])"
                  title="Please enter date in MM-DD format"
                />
                <p className="text-sm text-muted-foreground">
                  We'll celebrate your birthday with the team! (Year not required)
                </p>
              </div>

              {/* Insight Personality Assessment */}
              <div className="space-y-4 pt-4 border-t">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Insight Personality Assessment</h3>
                  <p className="text-sm text-muted-foreground">
                    Enter your personality percentages. Total must equal 100%.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="red">Red %</Label>
                    <Input
                      id="red"
                      type="number"
                      min="0"
                      max="100"
                      value={redPercentage}
                      onChange={(e) => setRedPercentage(parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="blue">Blue %</Label>
                    <Input
                      id="blue"
                      type="number"
                      min="0"
                      max="100"
                      value={bluePercentage}
                      onChange={(e) => setBluePercentage(parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="green">Green %</Label>
                    <Input
                      id="green"
                      type="number"
                      min="0"
                      max="100"
                      value={greenPercentage}
                      onChange={(e) => setGreenPercentage(parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="yellow">Yellow %</Label>
                    <Input
                      id="yellow"
                      type="number"
                      min="0"
                      max="100"
                      value={yellowPercentage}
                      onChange={(e) => setYellowPercentage(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  Total: {redPercentage + bluePercentage + greenPercentage + yellowPercentage}%
                  {(redPercentage + bluePercentage + greenPercentage + yellowPercentage) === 100 && " ✓"}
                </div>
              </div>

              <Button type="submit" disabled={saving} className="w-full">
                {saving ? "Saving..." : "Save Profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Profile;