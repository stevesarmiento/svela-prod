"use client";

import { useSession, useUser } from "@clerk/nextjs";
import { Badge } from "@v1/ui/badge";
import { Button } from "@v1/ui/button";
import { MonitorSmartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getClerkErrorMessage } from "./clerk-errors";

type UserResource = NonNullable<ReturnType<typeof useUser>["user"]>;
type SessionWithActivities = Awaited<
  ReturnType<UserResource["getSessions"]>
>[number];

export function ActiveSessions() {
  const { user } = useUser();
  const { session: currentSession } = useSession();
  const [sessions, setSessions] = useState<SessionWithActivities[] | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    try {
      const result = await user.getSessions();
      setSessions(result);
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to load sessions"));
      setSessions([]);
    }
  }, [user]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  if (!user) return null;

  const handleRevoke = async (session: SessionWithActivities) => {
    setBusyId(session.id);
    try {
      await session.revoke();
      await loadSessions();
      toast.success("Device signed out");
    } catch (error) {
      toast.error(getClerkErrorMessage(error, "Failed to sign out device"));
    } finally {
      setBusyId(null);
    }
  };

  const describeSession = (session: SessionWithActivities) => {
    const activity = session.latestActivity;
    const browser = [activity?.browserName, activity?.browserVersion]
      .filter(Boolean)
      .join(" ");
    const device = activity?.isMobile
      ? "Mobile device"
      : activity?.deviceType || "Desktop device";
    const location = [activity?.city, activity?.country]
      .filter(Boolean)
      .join(", ");
    return { browser: browser || "Unknown browser", device, location };
  };

  return (
    <div className="space-y-4">
      <div className="text-primary/40 text-xs text-pretty">
        Devices currently signed in to your account.
      </div>

      {sessions === null ? (
        <div className="text-xs text-muted-foreground">Loading devices...</div>
      ) : sessions.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No active devices found.
        </div>
      ) : (
        <div className="rounded-lg border border-primary/5 overflow-hidden">
          <div className="divide-y divide-primary/5">
            {sessions.map((session) => {
              const isCurrent = session.id === currentSession?.id;
              const isBusy = busyId === session.id;
              const { browser, device, location } = describeSession(session);

              return (
                <div
                  key={session.id}
                  className="p-3 flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1 shrink-0">
                      <MonitorSmartphone className="h-4 w-4 text-primary/50" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="font-bold text-xs truncate">
                          {device} · {browser}
                        </div>
                        {isCurrent ? (
                          <Badge variant="success" className="text-[10px]">
                            This device
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-[10px] text-primary/30">
                        {[
                          location,
                          session.lastActiveAt
                            ? `Active ${new Date(session.lastActiveAt).toLocaleString()}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  </div>

                  {!isCurrent ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs shrink-0"
                      disabled={isBusy}
                      onClick={() => handleRevoke(session)}
                    >
                      {isBusy ? "Signing out..." : "Sign out"}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
