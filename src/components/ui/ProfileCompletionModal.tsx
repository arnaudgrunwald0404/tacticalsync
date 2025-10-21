import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import AvatarSelector from "@/components/AvatarSelector";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ProfileCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  initialData?: {
    firstName: string;
    lastName: string;
    avatarName?: string;
  };
}

export function ProfileCompletionModal({
  isOpen,
  onClose,
  onComplete,
  initialData = { firstName: "", lastName: "", avatarName: "" }
}: ProfileCompletionModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState(initialData.firstName);
  const [lastName, setLastName] = useState(initialData.lastName);
  const [avatarName, setAvatarName] = useState(initialData.avatarName || "");

  const isFormComplete = firstName.trim() !== "" && lastName.trim() !== "" && avatarName.trim() !== "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      console.log("Updating profile with:", {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        avatar_name: avatarName.trim(),
        user_id: user.id
      });

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          avatar_name: avatarName.trim()
        })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated.",
      });

      onComplete();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-atkinson-hyperlegible">Welcome!</DialogTitle>
          <DialogDescription className="font-public-sans">
            Please complete your profile to access the meeting
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter your first name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter your last name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Choose Your Avatar</Label>
              <AvatarSelector
                selectedAvatar={avatarName}
                onSelect={setAvatarName}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="submit"
              disabled={!isFormComplete || loading}
              className="w-full sm:w-auto"
            >
              {loading ? "Updating..." : "Access Meeting"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
