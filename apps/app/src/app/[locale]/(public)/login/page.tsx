import { GoogleSignin } from "@/components/google-signin";
import { cn } from "@v1/ui/cn";
// import AuthNav from "./_components/auth-nav";
// import FooterOnboarding from "./_components/auth-footer";
import { SvelaLogo } from "@v1/ui/svela-logo";

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
      <div className="h-screen w-full flex flex-col justify-center items-center">
          {/* <AuthNav /> */}
        <div className="flex flex-col items-center justify-center gap-4">
              <SvelaLogo 
                width={62.5} 
                height={62.5}
                adaptive={true}
                className="opacity-50"
              />
          <div className="flex flex-col items-center justify-center">
            <h1 className="text-4xl font-semibold">Clarity & Action</h1>
            <p className="text-lg text-muted-foreground text-center">
              Connect an account to start using Svela.
            </p>
          </div>
          <GoogleSignin />
        </div>
        {/* <FooterOnboarding /> */}
      </div>
    </div>
  );
}
