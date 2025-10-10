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
  const [email, setEmail] = useState("");
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [redPercentage, setRedPercentage] = useState("");
  const [bluePercentage, setBluePercentage] = useState("");
  const [greenPercentage, setGreenPercentage] = useState("");
  const [yellowPercentage, setYellowPercentage] = useState("");
  const [uploading, setUploading] = useState(false);

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
      setEmail(data.email || user.email || "");
      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setRedPercentage(data.red_percentage ? String(data.red_percentage) : "");
      setBluePercentage(data.blue_percentage ? String(data.blue_percentage) : "");
      setGreenPercentage(data.green_percentage ? String(data.green_percentage) : "");
      setYellowPercentage(data.yellow_percentage ? String(data.yellow_percentage) : "");
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

      // Validate personality percentages are whole numbers between 0-100
      const percentages = [redPercentage, bluePercentage, greenPercentage, yellowPercentage];
      for (const pct of percentages) {
        if (pct !== "") {
          const num = Number(pct);
          if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 100) {
            toast({
              variant: "destructive",
              title: "Invalid Percentage",
              description: "Each percentage must be a whole number between 0 and 100",
            });
            setSaving(false);
            return;
          }
        }
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
          red_percentage: redPercentage ? Number(redPercentage) : 0,
          blue_percentage: bluePercentage ? Number(bluePercentage) : 0,
          green_percentage: greenPercentage ? Number(greenPercentage) : 0,
          yellow_percentage: yellowPercentage ? Number(yellowPercentage) : 0,
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Avatar image must be less than 5MB",
        });
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Please upload an image file",
        });
        return;
      }

      setUploading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      
      // Delete old avatar if exists
      const { data: existingFiles } = await supabase.storage
        .from('avatars')
        .list(user.id);
      
      if (existingFiles && existingFiles.length > 0) {
        await supabase.storage
          .from('avatars')
          .remove(existingFiles.map(f => `${user.id}/${f.name}`));
      }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, avatar_url: data.publicUrl });

      toast({
        title: "Avatar updated!",
        description: "Your profile picture has been changed successfully.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message,
      });
    } finally {
      setUploading(false);
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
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors">
                      <Upload className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                      disabled={uploading}
                    />
                  </label>
                  {uploading && (
                    <div className="absolute inset-0 bg-background/80 rounded-full flex items-center justify-center">
                      <div className="text-sm">Uploading...</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="bg-muted cursor-not-allowed"
                />
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
                    Enter whole numbers (0-100) for each personality color.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="red">Red</Label>
                    <div className="relative">
                      <Input
                        id="red"
                        type="text"
                        placeholder="0"
                        value={redPercentage}
                        onChange={(e) => setRedPercentage(e.target.value)}
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="blue">Blue</Label>
                    <div className="relative">
                      <Input
                        id="blue"
                        type="text"
                        placeholder="0"
                        value={bluePercentage}
                        onChange={(e) => setBluePercentage(e.target.value)}
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="green">Green</Label>
                    <div className="relative">
                      <Input
                        id="green"
                        type="text"
                        placeholder="0"
                        value={greenPercentage}
                        onChange={(e) => setGreenPercentage(e.target.value)}
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="yellow">Yellow</Label>
                    <div className="relative">
                      <Input
                        id="yellow"
                        type="text"
                        placeholder="0"
                        value={yellowPercentage}
                        onChange={(e) => setYellowPercentage(e.target.value)}
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
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