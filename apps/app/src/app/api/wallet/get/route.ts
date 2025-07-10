import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { env } from "../../../../env.mjs";

export async function POST() {
  try {
    // Get authenticated user from Clerk
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user details from Clerk to get email
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    
    if (!user.emailAddresses?.[0]?.emailAddress) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 }
      );
    }

    const userEmail = user.emailAddresses[0].emailAddress;
    console.log("Fetching wallet for authenticated user:", userEmail);

    const apiKey = env.CROSSMINT_SERVER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Crossmint server API key not configured" },
        { status: 500 }
      );
    }

    // Try multiple email variations to handle normalization differences
    const emailVariations = [
      userEmail, // Original email from Clerk
      userEmail.replace(/\./g, ''), // Remove dots (e.g., sarmiento.steven@gmail.com -> sarmientosteven@gmail.com)
    ];

    let wallet = null;
    let lastError = null;

    for (const emailVariation of emailVariations) {
      try {
        console.log(`Trying email variation: ${emailVariation}`);
        
        // Use Crossmint REST API to get wallets for this user
        const response = await fetch(`https://staging.crossmint.com/api/v1-alpha2/wallets?linkedUser=email:${emailVariation}`, {
          method: "GET",
          headers: {
            "X-API-KEY": apiKey,
          },
        });

        if (response.ok) {
          const wallets = await response.json();
          console.log(`Wallets found for ${emailVariation}:`, wallets);
          
          if (wallets && wallets.length > 0) {
            wallet = wallets[0];
            console.log(`Successfully found wallet with email: ${emailVariation}`);
            break;
          }
        } else {
          const errorText = await response.text();
          lastError = `${response.status}: ${errorText}`;
          console.log(`No wallet found for ${emailVariation}: ${lastError}`);
        }
      } catch (error) {
        console.log(`Error trying ${emailVariation}:`, error);
        lastError = error;
      }
    }

    if (!wallet) {
      console.error("No wallet found for any email variation");
      return NextResponse.json(
        { 
          error: `No wallet found. Tried emails: ${emailVariations.join(', ')}. Last error: ${lastError}`,
          suggestedAction: "create_new_wallet"
        },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ wallet });
  } catch (error) {
    console.error("Failed to fetch wallet:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 