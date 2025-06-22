import { redirect } from "next/navigation";

export const metadata = {
  title: "Dashboard",
};

export default async function Page() {
  // The middleware already handles redirects, so this page can just
  // redirect to the main overview page.
  redirect("/overview");

  return null;
}