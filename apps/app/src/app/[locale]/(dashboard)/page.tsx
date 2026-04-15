import { redirect } from "next/navigation";

export const metadata = {
  title: "Watchlist",
};

export default async function Page() {
  // Immediate redirect to watchlists to prevent flash
  redirect("/watchlists");
}
