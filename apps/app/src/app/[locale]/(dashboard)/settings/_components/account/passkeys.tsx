"use client";

import { useReverification, useUser } from "@clerk/nextjs";
import {
  AlertDialog,
  AlertDialogAction,
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
import { Check, Fingerprint, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getClerkErrorMessage } from "./clerk-errors";

export function Passkeys() {
  const { user } = useUser();
  const [isCreating, setIsCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const createPasskey = useReverification(() => {
    if (!user) throw new Error("Not signed in");
    return user.createPasskey();
  });

  if (!user) return null;

  const passkeys = user.passkeys;

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await createPasskey();
      await user.reload();
      toast.success("Passkey added");
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to create passkey"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleRename = async (passkeyId: string) => {
    const passkey = user.passkeys.find((p) => p.id === passkeyId);
    const name = renameValue.trim();
    if (!passkey || !name) return;
    setBusyId(passkeyId);
    try {
      await passkey.update({ name });
      setRenamingId(null);
      setRenameValue("");
      toast.success("Passkey renamed");
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to rename passkey"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (passkeyId: string) => {
    const passkey = user.passkeys.find((p) => p.id === passkeyId);
    if (!passkey) return;
    setBusyId(passkeyId);
    try {
      await passkey.delete();
      await user.reload();
      toast.success("Passkey removed");
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to remove passkey"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-primary/40 text-xs text-pretty">
        Passkeys let you sign in with your device's fingerprint, face
        recognition, or screen lock.
      </div>

      {passkeys.length > 0 ? (
        <div className="rounded-lg border border-primary/5 overflow-hidden">
          <div className="divide-y divide-primary/5">
            {passkeys.map((passkey) => {
              const isBusy = busyId === passkey.id;
              const isRenaming = renamingId === passkey.id;

              return (
                <div
                  key={passkey.id}
                  className="p-3 flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1 shrink-0">
                      <Fingerprint className="h-4 w-4 text-primary/50" />
                    </div>
                    <div className="min-w-0 space-y-0.5 flex-1">
                      {isRenaming ? (
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label="Passkey name"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="text-xs h-8 max-w-48"
                          />
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label="Save passkey name"
                            className="h-8 w-8"
                            disabled={isBusy || !renameValue.trim()}
                            onClick={() => handleRename(passkey.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Cancel rename"
                            className="h-8 w-8"
                            onClick={() => {
                              setRenamingId(null);
                              setRenameValue("");
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="font-bold text-xs truncate">
                            {passkey.name || "Passkey"}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Rename ${passkey.name || "passkey"}`}
                            className="h-6 w-6"
                            onClick={() => {
                              setRenamingId(passkey.id);
                              setRenameValue(passkey.name ?? "");
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="text-[10px] text-primary/30">
                        {passkey.lastUsedAt
                          ? `Last used ${new Date(passkey.lastUsedAt).toLocaleDateString()}`
                          : `Created ${new Date(passkey.createdAt).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Remove ${passkey.name || "passkey"}`}
                        disabled={isBusy}
                        className="h-8 w-8 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Remove this passkey?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          You will no longer be able to sign in with this
                          passkey.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction asChild>
                          <Button
                            variant="destructive"
                            onClick={() => handleDelete(passkey.id)}
                          >
                            Remove passkey
                          </Button>
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          No passkeys added yet.
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="h-9 text-xs"
        disabled={isCreating}
        onClick={handleCreate}
      >
        {isCreating ? "Waiting for device..." : "Add a passkey"}
      </Button>
    </div>
  );
}
