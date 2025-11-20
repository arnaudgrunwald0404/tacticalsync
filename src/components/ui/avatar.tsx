import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn("relative flex h-10 w-10 flex-shrink-0 overflow-hidden rounded-full", className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

// Only allow avatar images from safe origins: same-origin or Supabase storage.
function isAllowedAvatarUrl(src?: string | null): boolean {
  if (!src) return false;
  try {
    const url = new URL(src, window.location.origin);
    const host = url.hostname.toLowerCase();
    // same-origin (including localhost in dev)
    if (url.origin === window.location.origin) return true;
    // Supabase storage domains
    if (host.endsWith("supabase.co")) return true;
    return false;
  } catch {
    // If src is a relative path that failed URL parse, do not allow
    return false;
  }
}

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, src, ...props }, ref) => {
  if (!isAllowedAvatarUrl(typeof src === 'string' ? src : undefined)) {
    // Block third-party avatar hosts; show fallback initials instead
    return null as any;
  }
  return (
    <AvatarPrimitive.Image ref={ref} className={cn("aspect-square h-full w-full object-cover", className)} src={src as any} {...props} />
  );
});
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
