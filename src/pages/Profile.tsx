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
import AvatarSelector from "@/components/AvatarSelector";
import FancyAvatar from "@/components/ui/fancy-avatar";
import Logo from "@/components/Logo";
import GridBackground from "@/components/ui/grid-background";
import { UserProfileHeader } from "@/components/ui/user-profile-header";

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<unknown>(null);
  const [email, setEmail] = useState("");
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [redPercentage, setRedPercentage] = useState("");
  const [bluePercentage, setBluePercentage] = useState("");
  const [greenPercentage, setGreenPercentage] = useState("");
  const [yellowPercentage, setYellowPercentage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [avatarName, setAvatarName] = useState("");

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
      setAvatarName(data.avatar_name || `${data.first_name || ""} ${data.last_name || ""}`.trim() || "User");
      // Format birthday for input (without year if stored)
      if (data.birthday) {
        const date = new Date(data.birthday);
        // Store as MM-DD format (month and day only)
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        setBirthday(`${month}-${day}`);
      }
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
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
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUploadFromFile = async (file: File) => {
    try {
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
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error instanceof Error ? error.message : "An error occurred",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarNameChange = async (newAvatarName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_name: newAvatarName })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "Avatar updated!",
        description: "Your avatar has been changed successfully.",
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : "An error occurred",
      });
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
    <GridBackground inverted className="min-h-screen bg-gradient-to-br from-[#F5F3F0] via-white to-[#F8F6F2] overscroll-none">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between relative pr-20">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="h-8 sm:h-10 px-2 sm:px-4">
              <ArrowLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <Logo variant="minimal" size="lg" />
          </div>
          <UserProfileHeader />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle>Your Profile</CardTitle>
            <CardDescription>
              Update your personal information and birthday
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-8">
              {/* Email and Name Fields */}
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

              {/* Profile Picture Section */}
              <div className="flex justify-center">
                <AvatarSelector
                  currentName={avatarName}
                  userFirstName={firstName || "User"}
                  userLastName={lastName || ""}
                  avatarUrl={profile?.avatar_url}
                  uploading={uploading}
                  onAvatarChange={(newName) => {
                    setAvatarName(newName);
                    // Save to database
                    handleAvatarNameChange(newName);
                  }}
                  onAvatarUpload={handleAvatarUploadFromFile}
                  className="max-w-2xl"
                />
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
                  <h3 className="text-lg font-semibold mb-1">Insights Discovery Profile</h3>
                  <p className="text-sm text-muted-foreground">
                    Enter whole numbers (0-100) for each personality color.
                  </p>
                </div>

                <div className="flex gap-6">
                  {/* Input fields on the left */}
                  <div className="flex-1 space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="red" className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                          Red
                        </span>
                      </Label>
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
                      <Label htmlFor="yellow" className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                          Yellow
                        </span>
                      </Label>
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

                    <div className="space-y-2">
                      <Label htmlFor="green" className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Green
                        </span>
                      </Label>
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
                      <Label htmlFor="blue" className="flex items-center gap-2">
                        <span className="font-body inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#C97D60]/20 text-[#C97D60]">
                          Blue
                        </span>
                      </Label>
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
                  </div>

                  {/* Pie Chart on the right */}
                  {(Number(redPercentage) + Number(yellowPercentage) + Number(greenPercentage) + Number(bluePercentage)) > 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center p-4 bg-[#F5F3F0] rounded-lg">
                      <h4 className="text-sm font-medium mb-4">Your Insight Discovery Profile</h4>
                      <div className="w-48 h-48 rounded-full overflow-hidden" style={{
                        background: `conic-gradient(
                          from 0deg,
                          rgb(254, 226, 226) 0deg ${(Number(redPercentage) || 0) * 3.6}deg,
                          rgb(254, 249, 195) ${(Number(redPercentage) || 0) * 3.6}deg ${((Number(redPercentage) || 0) + (Number(yellowPercentage) || 0)) * 3.6}deg,
                          rgb(220, 252, 231) ${((Number(redPercentage) || 0) + (Number(yellowPercentage) || 0)) * 3.6}deg ${((Number(redPercentage) || 0) + (Number(yellowPercentage) || 0) + (Number(greenPercentage) || 0)) * 3.6}deg,
                          rgb(219, 234, 254) ${((Number(redPercentage) || 0) + (Number(yellowPercentage) || 0) + (Number(greenPercentage) || 0)) * 3.6}deg 360deg
                        )`
                      }}>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Button type="submit" disabled={saving} className="w-full">
                {saving ? "Saving..." : "Save Profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </GridBackground>
  );
};

export default Profile;