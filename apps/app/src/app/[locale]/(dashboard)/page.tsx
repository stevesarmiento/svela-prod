import { redirect } from "next/navigation";

export const metadata = {
  title: "Watchlist",
};

export default async function Page() {
  // Immediate redirect to watchlist to prevent flash
  redirect("/watchlist");
}