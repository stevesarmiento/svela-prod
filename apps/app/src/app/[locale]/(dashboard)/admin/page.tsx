import { env } from "@/env.mjs";
import { getAuthToken } from "@/lib/auth";
import { createMetadata } from "@/lib/metadata";
import { currentUser } from "@clerk/nextjs/server";
import { preloadQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { AdminStatsDashboard } from "./admin-stats-dashboard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return createMetadata({
    title: "Admin",
    pathname: "/admin",
    locale,
  });
}

function parseAdminEmails(): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export default async function AdminPage() {
  // Page-level gate (UX only — the Convex query is the security boundary).
  const user = await currentUser();
  const allowlist = parseAdminEmails();
  const emails = (user?.emailAddresses ?? []).map((e) =>
    e.emailAddress.trim().toLowerCase(),
  );
  const isAdmin = emails.some((email) => allowlist.has(email));
  if (!isAdmin) notFound();

  const token = await getAuthToken();
  if (!token) notFound();

  const preloadedStats = await preloadQuery(
    api.adminStats.getAdminDashboardStats,
    {},
    { token },
  );

  return <AdminStatsDashboard preloadedStats={preloadedStats} />;
}
