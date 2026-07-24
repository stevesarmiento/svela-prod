"use client";

import { useClerk, useReverification, useUser } from "@clerk/nextjs";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@v1/ui/alert-dialog";
import { Button } from "@v1/ui/button";
import { Input } from "@v1/ui/input";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getClerkErrorMessage } from "./clerk-errors";

const CONFIRM_TEXT = "DELETE";

export function DangerZone() {
  const { user } = useUser();
  const clerk = useClerk();
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const deleteAccount = useReverification(() => {
    if (!user) throw new Error("Not signed in");
    return user.delete();
  });

  if (!user) return null;

  const handleDelete = async () => {
    if (confirmation !== CONFIRM_TEXT) return;
    setIsDeleting(true);
    try {
      await deleteAccount();
      // Session is invalidated by deletion; sign out defensively and redirect.
      await clerk.signOut({ redirectUrl: "/login" });
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to delete account"));
      // react-doctor-disable-next-line react-doctor/no-loading-flag-reset-outside-finally -- reset mirrored in catch; success path intentionally stays disabled through the sign-out redirect
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1 shrink-0">
          <TriangleAlert className="h-4 w-4 text-rose-400" />
        </div>
        <div className="space-y-0.5">
          <div className="font-bold text-xs">Delete account</div>
          <div className="text-primary/40 text-xs text-pretty">
            Permanently delete your account and all associated data. This cannot
            be undone.
          </div>
        </div>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setConfirmation("");
        }}
      >
        <AlertDialogTrigger asChild>
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs shrink-0"
          >
            Delete account
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account, settings, and data. Type{" "}
              <span className="font-berkeley-mono font-semibold">
                {CONFIRM_TEXT}
              </span>{" "}
              to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            aria-label={`Type ${CONFIRM_TEXT} to confirm`}
            placeholder={CONFIRM_TEXT}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="text-xs"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={confirmation !== CONFIRM_TEXT || isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Deleting..." : "Delete forever"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
