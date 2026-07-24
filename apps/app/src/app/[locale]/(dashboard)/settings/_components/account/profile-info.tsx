"use client";

import { useUser } from "@clerk/nextjs";
import { Avatar, AvatarFallback, AvatarImage } from "@v1/ui/avatar";
import { Button } from "@v1/ui/button";
import { Input } from "@v1/ui/input";
import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { getUserDisplayName } from "@/lib/user-display";
import { getClerkErrorMessage } from "./clerk-errors";

export function ProfileInfo() {
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  if (!user) return null;

  const displayName = getUserDisplayName({
    fullName: user.fullName ?? undefined,
    email: user.primaryEmailAddress?.emailAddress ?? undefined,
    walletAddress: user.primaryWeb3Wallet?.web3Wallet ?? undefined,
    fallback: "User",
  });

  const isDirty =
    firstName !== (user.firstName ?? "") || lastName !== (user.lastName ?? "");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to update profile"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await user.setProfileImage({ file });
      toast.success("Profile photo updated");
    } catch (error) {
      toast.error(
        getClerkErrorMessage(error, "Failed to update profile photo"),
      );
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          aria-label="Change profile photo"
          className="relative group rounded-md"
        >
          <Avatar className="h-14 w-14 rounded-md shadow-sm shadow-black/30 ring-1 ring-black/10 dark:ring-white/10">
            {user.imageUrl ? (
              <AvatarImage src={user.imageUrl} alt={displayName} />
            ) : null}
            <AvatarFallback>
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="h-4 w-4 text-white" />
          </div>
        </button>
        <div className="space-y-0.5">
          <div className="font-bold text-xs">{displayName}</div>
          <div className="text-primary/40 text-xs">
            {isUploading
              ? "Uploading photo..."
              : "Click the photo to upload a new one."}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarChange}
        />
      </div>

      {/* Name */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          aria-label="First name"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="text-xs flex-1"
        />
        <Input
          aria-label="Last name"
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="text-xs flex-1"
        />
        <Button
          size="sm"
          className="h-9 text-xs whitespace-nowrap"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
