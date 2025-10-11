import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Shuffle, Check, Upload } from "lucide-react";
import FancyAvatar from "@/components/ui/fancy-avatar";

interface AvatarSelectorProps {
  currentName: string;
  userFirstName: string;
  userLastName: string;
  avatarUrl?: string;
  onAvatarChange: (newName: string) => void;
  onAvatarUpload: (file: File) => Promise<void>;
  uploading?: boolean;
  className?: string;
}

const AvatarSelector: React.FC<AvatarSelectorProps> = ({ 
  currentName, 
  userFirstName,
  userLastName,
  avatarUrl,
  onAvatarChange,
  onAvatarUpload,
  uploading = false,
  className = "" 
}) => {
  // Use user's full name as the base for avatar generation
  const userFullName = `${userFirstName} ${userLastName}`;
  const [selectedName, setSelectedName] = useState(currentName || userFullName);
  const [isGenerating, setIsGenerating] = useState(false);
  const [seedNumber, setSeedNumber] = useState(0);

  // Generate a variation of the user's name with a seed number
  // This ensures the same initials but different visual patterns
  const generateRandomSeed = () => {
    return Math.floor(Math.random() * 10000);
  };

  const handleRandomize = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const newSeed = generateRandomSeed();
      setSeedNumber(newSeed);
      // Append seed to the name to generate different patterns while keeping initials
      setSelectedName(`${userFullName}${newSeed}`);
      setIsGenerating(false);
    }, 500);
  };

  const handleConfirm = () => {
    onAvatarChange(selectedName);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAvatarUpload) {
      await onAvatarUpload(file);
    }
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader className="text-center">
        <CardTitle className="text-lg">Profile Picture</CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload your own picture or choose a generated avatar
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="avatar" className="w-full">
          <TabsList className="grid w-full grid-cols-2">

            <TabsTrigger value="avatar">Choose avatar</TabsTrigger>
            <TabsTrigger value="upload">Upload a picture</TabsTrigger>
          </TabsList>

          {/* Upload Picture Tab */}
          <TabsContent value="upload" className="space-y-6 mt-6">
            <div className="flex justify-center items-center" style={{ minHeight: "200px" }}>
              <div className="relative">
                <label className="cursor-pointer">
                  <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors shadow-lg">
                    <Upload className="h-10 w-10 text-primary-foreground" />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={uploading}
                  />
                </label>
                {uploading && (
                  <div className="absolute inset-0 bg-background/80 rounded-full flex items-center justify-center">
                    <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                )}
              </div>
            </div>

            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                Click the upload icon to change your profile picture
              </p>
              <p className="text-xs text-muted-foreground">
                Max file size: 5MB • Supported formats: JPG, PNG, GIF
              </p>
            </div>

            {avatarUrl && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // TODO: Add remove picture functionality
                  }}
                >
                  Remove Picture
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Choose Avatar Tab */}
          <TabsContent value="avatar" className="space-y-6 mt-6">
            <div className="flex justify-center">
              <div className="relative">
                <FancyAvatar 
                  name={selectedName} 
                  displayName={`${userFirstName} ${userLastName}`.trim()}
                  size="lg" 
                />
                {isGenerating && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                    <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full" />
                  </div>
                )}
              </div>
            </div>

            <div className="text-center space-y-2">
            
              <p className="text-xs text-muted-foreground">
                Click randomize to generate different more patterns.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleRandomize}
                disabled={isGenerating}
                className="flex-1"
              >
                <Shuffle className="w-4 h-4 mr-2" />
                {isGenerating ? "Generating..." : "Randomize"}
              </Button>
              
              <Button
                onClick={handleConfirm}
                disabled={isGenerating}
                className="flex-1"
              >
                <Check className="w-4 h-4 mr-2" />
                Confirm
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AvatarSelector;
