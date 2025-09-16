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
          <div className="flex flex-col items-center justify-center text-center">
            <h1 className="text-4xl font-semibold bg-gradient-to-br from-primary to-primary/40 bg-clip-text text-transparent">The feeling you get in the moments<br /> where clarity meets action.</h1>
            <p className="text-xl text-muted-foreground text-center mt-2">
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
