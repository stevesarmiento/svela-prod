import { redirect } from "next/navigation";
import { getUser } from "@v1/supabase/queries";

export const metadata = {
  title: "Dashboard",
};

export default async function Page() {
  const { data } = await getUser();
  
  if (data?.user) {
    redirect("/overview");
  }

  return null;
}