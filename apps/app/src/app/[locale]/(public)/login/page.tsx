import { GoogleSignin } from "@/components/google-signin";
import { cn } from "@v1/ui/cn";
import AuthNav from "./_components/auth-nav";
import FooterOnboarding from "./_components/auth-footer";

export const metadata = {
  title: "Login",
};

export default function Page() {
  return (
    <div
        className={cn(
        'w-[100%] h-screen overflow-hidden flex flex-row bg-background',
        )}
    >
      <div className="h-screen w-[50%] flex flex-col justify-between items-center">
          <AuthNav />
        <div className="animate-fade-in-up transition-spring">
          <GoogleSignin />
        </div>
        <FooterOnboarding />
      </div>
      <div className="w-[50%] items-center h-[calc(100vh-30px)] bg-primary/10 m-4 rounded-xl">
      </div>
    </div>
  );
}
