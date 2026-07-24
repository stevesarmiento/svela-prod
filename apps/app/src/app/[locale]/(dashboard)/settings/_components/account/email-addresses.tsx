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
import { Badge } from "@v1/ui/badge";
import { Button } from "@v1/ui/button";
import { Input } from "@v1/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@v1/ui/input-otp";
import { Separator } from "@v1/ui/separator";
import { Mail, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getClerkErrorMessage } from "./clerk-errors";

export function EmailAddresses() {
  const { user } = useUser();
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmailId, setPendingEmailId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const createEmailAddress = useReverification((email: string) => {
    if (!user) throw new Error("Not signed in");
    return user.createEmailAddress({ email });
  });

  if (!user) return null;

  const emails = user.emailAddresses;

  const startVerification = async (emailId: string) => {
    const email = user.emailAddresses.find((e) => e.id === emailId);
    if (!email) return;
    await email.prepareVerification({ strategy: "email_code" });
    setPendingEmailId(emailId);
    setCode("");
  };

  const handleAdd = async () => {
    const email = newEmail.trim();
    if (!email) return;

    setIsAdding(true);
    try {
      const created = await createEmailAddress(email);
      setNewEmail("");
      await startVerification(created.id);
      toast.success("Verification code sent", {
        description: `Check ${email} for a 6-digit code.`,
      });
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to add email address"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleVerify = async () => {
    if (!pendingEmailId || code.length !== 6) return;
    const email = user.emailAddresses.find((e) => e.id === pendingEmailId);
    if (!email) return;

    setIsVerifying(true);
    try {
      await email.attemptVerification({ code });
      await user.reload();
      setPendingEmailId(null);
      setCode("");
      toast.success("Email address verified");
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Invalid verification code"));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmailId) return;
    try {
      await startVerification(pendingEmailId);
      toast.success("Verification code re-sent");
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to send code"));
    }
  };

  const handleSetPrimary = async (emailId: string) => {
    setBusyId(emailId);
    try {
      await user.update({ primaryEmailAddressId: emailId });
      toast.success("Primary email updated");
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to set primary email"));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (emailId: string) => {
    const email = user.emailAddresses.find((e) => e.id === emailId);
    if (!email) return;
    setBusyId(emailId);
    try {
      await email.destroy();
      await user.reload();
      if (pendingEmailId === emailId) {
        setPendingEmailId(null);
        setCode("");
      }
      toast.success("Email address removed");
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to remove email"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-primary/40 text-xs text-pretty">
        Email addresses linked to your account. Your primary email receives
        account notifications.
      </div>

      {emails.length > 0 ? (
        <div className="rounded-lg border border-primary/5 overflow-hidden">
          <div className="divide-y divide-primary/5">
            {emails.map((email) => {
              const isPrimary = email.id === user.primaryEmailAddressId;
              const isVerified = email.verification?.status === "verified";
              const isPendingHere = pendingEmailId === email.id;
              const isBusy = busyId === email.id;

              return (
                <div key={email.id} className="p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1 shrink-0">
                        <Mail className="h-4 w-4 text-primary/50" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="font-bold text-xs truncate">
                            {email.emailAddress}
                          </div>
                          {isPrimary ? (
                            <Badge variant="tag" className="text-[10px]">
                              Primary
                            </Badge>
                          ) : null}
                          {!isVerified ? (
                            <Badge variant="outline" className="text-[10px]">
                              Unverified
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isVerified && !isPrimary ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={isBusy}
                          onClick={() => handleSetPrimary(email.id)}
                        >
                          Set primary
                        </Button>
                      ) : null}
                      {!isVerified && !isPendingHere ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() =>
                            startVerification(email.id).catch((error) =>
                              toast.error(
                                getClerkErrorMessage(
                                  error,
                                  "Failed to send code",
                                ),
                              ),
                            )
                          }
                        >
                          Verify
                        </Button>
                      ) : null}
                      {!isPrimary ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label={`Remove ${email.emailAddress}`}
                              disabled={isBusy}
                              className="h-8 w-8"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Remove {email.emailAddress}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This email address will be unlinked from your
                                account. You can add it again later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction asChild>
                                <Button
                                  variant="destructive"
                                  onClick={() => handleRemove(email.id)}
                                >
                                  Remove email
                                </Button>
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null}
                    </div>
                  </div>

                  {/* Inline verification code entry */}
                  {isPendingHere ? (
                    <div className="mt-3 space-y-2">
                      <div className="text-[10px] text-primary/30">
                        Enter the 6-digit code sent to {email.emailAddress}
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <InputOTP
                          maxLength={6}
                          value={code}
                          onChange={setCode}
                          render={({ slots }) => (
                            <InputOTPGroup>
                              {slots.map((slot, index) => (
                                <InputOTPSlot
                                  key={`otp-slot-${
                                    // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
                                    index
                                  }`}
                                  {...slot}
                                  className="h-9 w-9 text-sm"
                                />
                              ))}
                            </InputOTPGroup>
                          )}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-9 text-xs"
                            disabled={code.length !== 6 || isVerifying}
                            onClick={handleVerify}
                          >
                            {isVerifying ? "Verifying..." : "Verify"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 text-xs"
                            onClick={handleResend}
                          >
                            Resend
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 text-xs"
                            onClick={() => {
                              setPendingEmailId(null);
                              setCode("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          No email addresses linked yet.
        </div>
      )}

      <Separator className="bg-primary/5 scale-125" />

      {/* Add email */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="email"
          autoComplete="email"
          aria-label="New email address"
          placeholder="Add an email address"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="text-xs flex-1"
        />
        <Button
          size="sm"
          className="h-9 text-xs whitespace-nowrap"
          disabled={!newEmail.trim() || isAdding}
          onClick={handleAdd}
        >
          {isAdding ? "Adding..." : "Add email"}
        </Button>
      </div>
    </div>
  );
}
