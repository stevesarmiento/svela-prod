"use client";

import { useWallet, SolanaWallet } from "@crossmint/client-sdk-react-ui";
import { Button } from "@v1/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@v1/ui/card";
import { Badge } from "@v1/ui/badge";
import { Skeleton } from "@v1/ui/skeleton";
import { Input } from "@v1/ui/input";
import { Label } from "@v1/ui/label";
import { useAuth } from "@v1/convex/hooks";
import { AlertCircle, Wallet, Copy, ExternalLink, Plus, Send } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";

export default function WalletPage() {
  const { user } = useAuth();
  const { getOrCreateWallet, wallet } = useWallet();
  const [copying, setCopying] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [userWallet, setUserWallet] = useState<{ address: string; chain?: string; id?: string } | null>(null);
  const [hasWallet, setHasWallet] = useState(false);
  const [isLoadingFromDatabase, setIsLoadingFromDatabase] = useState(true);
  const hasShownWalletLoadedToast = useRef(false);

  // Transaction state
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<{ hash: string; explorerLink: string } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Convex hooks for database operations
  const storeWallet = useMutation(api.wallets.storeWallet);
  const existingWallet = useQuery(api.wallets.getPrimaryWallet, 
    user?.id ? { clerkId: user.id } : "skip"
  );
  const updateWalletLastUsed = useMutation(api.wallets.updateWalletLastUsed);

  // Load existing wallet on page load
  useEffect(() => {
    if (existingWallet && !hasShownWalletLoadedToast.current) {
      console.log("Found existing wallet:", existingWallet);
      setUserWallet({
        address: existingWallet.walletAddress,
        chain: existingWallet.chain,
        id: existingWallet.crossmintWalletId,
      });
      setHasWallet(true);
      setIsLoadingFromDatabase(false);
      hasShownWalletLoadedToast.current = true;
      
      // Update last used timestamp
      updateWalletLastUsed({ walletAddress: existingWallet.walletAddress });
      
      toast.success("Wallet loaded from your account");
    } else if (existingWallet === null) {
      // Query completed but no wallet found
      setIsLoadingFromDatabase(false);
    }
  }, [existingWallet]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectToExistingWallet = async () => {
    if (!user?.email) {
      toast.error("Cannot connect to wallet");
      return;
    }

    setIsConnecting(true);
    try {
      console.log("Connecting to existing Crossmint wallet...");
      
      // Try to get the existing wallet using the SDK
      if (getOrCreateWallet) {
        console.log("Attempting to reconnect to existing wallet with different approaches...");
        
        // Try with the existing wallet address if we have it
        if (userWallet?.address) {
          try {
            console.log("Trying to connect to existing wallet with address:", userWallet.address);
            const reconnectedWallet = await (getOrCreateWallet as unknown as (args: { chain: string; signer: { type: string } }) => Promise<{ address: string; chain?: string; id?: string }>)({
              chain: "solana",
              signer: {
                type: "api-key",
              },
            });
            
            console.log("Reconnected wallet result:", reconnectedWallet);
            
            if (reconnectedWallet && reconnectedWallet.address === userWallet.address) {
              console.log("Successfully reconnected to existing wallet!");
              toast.success("Wallet reconnected! You can now send transactions.");
              return;
            }
          } catch (error) {
            console.log("Failed to reconnect to existing wallet:", error);
          }
        }
        
        // Try other approaches
        const walletTypes = ["solana-mpc-wallet", "solana-custodial-wallet"];
        let connectedWallet = null;
        
        for (const walletType of walletTypes) {
          try {
            console.log(`Trying to connect with type: ${walletType}`);
            const result = await (getOrCreateWallet as unknown as (args: { type: string; linkedUser: string }) => Promise<{ address: string; chain?: string; id?: string } | null>)({
              type: walletType,
              linkedUser: `email:${user.email}`,
            });
            
            console.log(`Result for ${walletType}:`, result);
            
            if (result && result.address) {
              console.log(`Successfully connected with type: ${walletType}`, result);
              connectedWallet = result;
              break;
            }
          } catch (error) {
            console.log(`Failed with type ${walletType}:`, error);
          }
        }

        if (connectedWallet) {
          toast.success("Wallet reconnected! You can now send transactions.");
        } else {
          console.error("All wallet connection attempts failed");
          toast.error("Failed to reconnect to wallet. Transactions will use demo mode.");
        }
      } else {
        toast.error("Wallet SDK not available");
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      toast.error(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const sendTransaction = async () => {
    if (!userWallet) {
      toast.error("No wallet available");
      return;
    }

    if (!recipientAddress || !amount) {
      toast.error("Please enter recipient address and amount");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsSending(true);
    try {
      console.log("Sending transaction...");
      console.log("Available wallet object:", wallet);
      console.log("Wallet methods:", wallet ? Object.getOwnPropertyNames(Object.getPrototypeOf(wallet)) : "No wallet");
      console.log("Wallet send method:", wallet?.send);
      console.log("Wallet type:", typeof wallet);
      console.log("User wallet from database:", userWallet);
      
      if (wallet) {
        // Use Crossmint SDK's wallet.send() method for real transactions
        console.log("Using Crossmint SDK wallet.send() method");
        
        // Check if send method exists
        if (typeof wallet.send === 'function') {
          try {
            console.log("Calling wallet.send with:", {
              recipient: recipientAddress,
              token: "SOL", 
              amount: amountNum.toString()
            });
            
            // Use the SDK's send method as documented
            const result = await wallet.send(recipientAddress, "SOL", amountNum.toString());
            
            console.log("Transaction sent successfully:", result);
            toast.success("Real SOL transaction sent successfully!");
            
            setLastTransaction({
              hash: result.hash,
              explorerLink: result.explorerLink || `https://explorer.solana.com/tx/${result.hash}?cluster=devnet`
            });
            
            // Clear form
            setRecipientAddress("");
            setAmount("");
            return; // Exit early on success
            
          } catch (sdkError) {
            console.error("SDK send method failed:", sdkError);
            console.error("Error details:", {
              message: sdkError instanceof Error ? sdkError.message : 'Unknown error',
              stack: sdkError instanceof Error ? sdkError.stack : undefined,
              name: sdkError instanceof Error ? sdkError.name : undefined
            });
            
            toast.error(`SDK send failed: ${sdkError instanceof Error ? sdkError.message : 'Unknown error'}`);
          }
        } else {
          console.error("Wallet.send method is not available");
          console.log("Available wallet properties:", Object.keys(wallet));
          toast.error("Wallet.send method is not available on this wallet instance");
        }
        
        // Try the Solana-specific approach
        console.log("Trying SolanaWallet approach...");
        try {
          const solanaWallet = SolanaWallet.from(wallet);
          console.log("Created SolanaWallet instance:", solanaWallet);
          console.log("SolanaWallet methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(solanaWallet)));
          
          // For now, we need to build a Solana transaction manually
          // This is a fallback approach - in production you'd use a Solana transaction builder
          toast.error("SolanaWallet requires a pre-built transaction. Using REST API fallback.");
          await sendViaRestAPI(amountNum);
          
        } catch (solanaError) {
          console.error("SolanaWallet approach also failed:", solanaError);
          // Final fallback to REST API
          await sendViaRestAPI(amountNum);
        }
      } else {
        console.log("No SDK wallet available, using REST API");
        toast.error("No Crossmint SDK wallet available - using REST API fallback");
        // No SDK wallet available, use REST API
        await sendViaRestAPI(amountNum);
      }

    } catch (error) {
      console.error("Transaction failed:", error);
      toast.error(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSending(false);
    }
  };

  const sendViaRestAPI = async (amountNum: number) => {
    if (!userWallet?.address) {
      throw new Error("No wallet address available");
    }
    
    console.log("Using REST API approach for transaction");
    
    const response = await fetch("/api/wallet/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipientAddress,
        amount: amountNum,
        walletAddress: userWallet.address,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log("Transaction sent via REST API:", result);
      toast.success(result.note || "Transaction sent successfully!");
      
      setLastTransaction({
        hash: result.hash || "rest_api_transaction_hash",
        explorerLink: result.explorerLink || `https://explorer.solana.com/tx/${result.hash || "demo"}`
      });
    } else {
      const error = await response.text();
      throw new Error(`REST API error: ${response.status} - ${error}`);
    }
  };

  const createWallet = async () => {
    if (!user?.email) {
      toast.error("User email is required to create a wallet");
      return;
    }

    if (!getOrCreateWallet) {
      console.error("getOrCreateWallet is not available - check Crossmint provider setup");
      toast.error("Wallet service not available. Please check your API key configuration.");
      return;
    }

    setIsCreating(true);
    console.log("Starting wallet creation for:", user.email);
    console.log("Crossmint API Key configured:", !!process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY);
    
    try {
      // Try multiple approaches for wallet creation
      console.log("Attempting wallet creation with different parameters...");
      
      // Approach 1: With API key signer for server-side transactions
      let wallet;
      try {
        console.log("Trying with API key signer for server-side transactions...");
        wallet = await (getOrCreateWallet as unknown as (args: { chain: string; signer: { type: string } }) => Promise<{ address: string; chain?: string; id?: string }>)({
          chain: "solana",
          signer: {
            type: "api-key",
          },
        });
        console.log("API key signer approach result:", wallet);
      } catch (error) {
        console.log("API key signer approach failed:", error);
      }

      // Approach 2: With type and linkedUser (fallback)
      if (!wallet) {
        try {
          console.log("Trying with type and linkedUser parameters...");
          wallet = await (getOrCreateWallet as unknown as (args: { type: string; linkedUser: string }) => Promise<{ address: string; chain?: string; id?: string }>)({
            type: "solana-custodial-wallet",
            linkedUser: `email:${user.email}`,
          });
          console.log("Type + linkedUser approach result:", wallet);
        } catch (error) {
          console.log("Type + linkedUser approach failed:", error);
        }
      }

      // Approach 3: Basic chain parameter (fallback)
      if (!wallet) {
        try {
          console.log("Trying basic chain parameter...");
          wallet = await (getOrCreateWallet as unknown as (args: { chain: string }) => Promise<{ address: string; chain?: string; id?: string }>)({
            chain: "solana",
          });
          console.log("Basic chain approach result:", wallet);
        } catch (error) {
          console.log("Basic chain approach failed:", error);
        }
      }

      // Approach 4: With owner parameter
      if (!wallet) {
        try {
          console.log("Trying with owner parameter...");
          wallet = await (getOrCreateWallet as unknown as (args: { chain: string; owner?: string }) => Promise<{ address: string; chain?: string; id?: string }>)({
            chain: "solana",
            owner: `email:${user.email}`,
          });
          console.log("Owner approach result:", wallet);
        } catch (error) {
          console.log("Owner approach failed:", error);
        }
      }

      // Approach 5: Just call without parameters
      if (!wallet) {
        try {
          console.log("Trying without parameters...");
          wallet = await (getOrCreateWallet as unknown as () => Promise<{ address: string; chain?: string; id?: string }>)();
          console.log("No-params approach result:", wallet);
        } catch (error) {
          console.log("No-params approach failed:", error);
        }
      }

      console.log("Final wallet response:", wallet);
      console.log("Wallet type:", typeof wallet);
      console.log("Is wallet truthy:", !!wallet);

      if (wallet && wallet.address) {
        console.log("Wallet created successfully:", wallet);
        console.log("Wallet type:", typeof wallet);
        console.log("Wallet constructor:", wallet.constructor?.name);
        console.log("Wallet methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(wallet)));
        console.log("Wallet send method available:", typeof (wallet as unknown as { send?: (...args: unknown[]) => unknown }).send === 'function');
        console.log("Wallet properties:", Object.keys(wallet));
        
        setUserWallet(wallet);
        setHasWallet(true);
        toast.success("Solana wallet created successfully!");
        
        // Store wallet association in database
        try {
          await storeWallet({
            clerkId: user.id,
            walletAddress: wallet.address,
            chain: wallet.chain || "solana",
            crossmintWalletId: wallet.id,
          });
          console.log("Wallet stored in database successfully");
        } catch (error) {
          console.error("Failed to store wallet association:", error);
          toast.error("Wallet created but failed to save to database");
        }
      } else {
        console.error("All wallet creation approaches failed");
        console.error("This usually means:");
        console.error("1. Invalid API key or environment mismatch");
        console.error("2. Missing wallet.create scope");
        console.error("3. User not properly authenticated in Crossmint");
        console.error("4. Network/connectivity issues");
        console.error("5. SDK configuration issue");
        
        console.log("Trying fallback REST API approach...");
        
        // Fallback: Try REST API directly
        try {
          const response = await fetch("/api/wallet/create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: user.id,
              userEmail: user.email,
              chain: "solana",
            }),
          });

          console.log("REST API Response status:", response.status);
          console.log("REST API Response ok:", response.ok);

          if (!response.ok) {
            const errorText = await response.text();
            console.error("REST API Error:", errorText);
            throw new Error(`API error: ${response.status} - ${errorText}`);
          }

          const { wallet: fallbackWallet } = await response.json();
          
          if (fallbackWallet && fallbackWallet.address) {
            console.log("Fallback wallet creation successful:", fallbackWallet);
            setUserWallet(fallbackWallet);
            setHasWallet(true);
            toast.success("Solana wallet created successfully!");
            
            // Store wallet association in database for REST API created wallet
            try {
              await storeWallet({
                clerkId: user.id,
                walletAddress: fallbackWallet.address,
                chain: "solana", // REST API doesn't return chain in response
                crossmintWalletId: fallbackWallet.id,
              });
              console.log("REST API wallet stored in database successfully");
            } catch (error) {
              console.error("Failed to store REST API wallet association:", error);
              toast.error("Wallet created but failed to save to database");
            }
            return;
          }
        } catch (fallbackError) {
          console.error("Fallback REST API also failed:", fallbackError);
          toast.error(`Failed to create wallet: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
        }
        
        if (!wallet) {
          toast.error("Failed to create wallet - please check console for details");
        }
      }
    } catch (error) {
      console.error("Failed to create wallet:", error);
      toast.error(`Failed to create wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const copyAddress = async () => {
    if (!userWallet?.address) return;
    
    setCopying(true);
    try {
      await navigator.clipboard.writeText(userWallet.address);
      toast.success("Address copied to clipboard");
    } catch {
      toast.error("Failed to copy address");
    } finally {
      setCopying(false);
    }
  };

  const openInExplorer = () => {
    if (!userWallet?.address) return;
    // Using Solana Explorer for Solana wallets
    const explorerUrl = `https://explorer.solana.com/address/${userWallet.address}`;
    window.open(explorerUrl, '_blank');
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-yellow-500 mb-4" />
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>
              Please sign in to access wallet features
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Wallet</h1>
        <p className="text-muted-foreground">
          Optional cryptocurrency wallet powered by Crossmint
        </p>
      </div>

      <div className="grid gap-6">
        {/* Wallet Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Wallet Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-4">
              <Badge variant={hasWallet && userWallet ? "default" : "secondary"}>
                {hasWallet && userWallet ? "Wallet Active" : "No Wallet"}
              </Badge>
              {user && (
                <span className="text-sm text-muted-foreground">
                  Signed in as {user.email}
                </span>
              )}
            </div>

            {isLoadingFromDatabase && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  Checking for existing wallet...
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}

            {isCreating && !isLoadingFromDatabase && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  Creating your wallet...
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}

            {hasWallet && userWallet && !isCreating && !isLoadingFromDatabase && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Wallet Address</label>
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <code className="flex-1 text-sm font-mono truncate">
                      {userWallet.address}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copyAddress}
                      disabled={copying}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={openInExplorer}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Network</label>
                  <div className="p-3 bg-muted rounded-lg">
                    <span className="text-sm capitalize">{userWallet.chain || "Solana"}</span>
                  </div>
                </div>
                
                {/* Connection Status */}
                {!wallet && userWallet && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-yellow-800">Wallet SDK Connection Required</p>
                        <p className="text-xs text-yellow-700">Connect SDK to enable real transactions</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={connectToExistingWallet}
                        disabled={isConnecting}
                        className="ml-3"
                      >
                        {isConnecting ? "Connecting..." : "Connect SDK"}
                      </Button>
                    </div>
                  </div>
                )}
                
                {(wallet || userWallet) && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-800">✅ Wallet Connected</p>
                    <p className="text-xs text-green-700">
                      {wallet ? "Ready to send transactions" : "Wallet loaded from database - transaction features coming soon"}
                    </p>
                  </div>
                )}
              </div>
            )}

            {!hasWallet && !isCreating && !isLoadingFromDatabase && (
              <div className="text-center py-8">
                <Wallet className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Wallet Yet</h3>
                <p className="text-muted-foreground mb-6">
                  Create a secure cryptocurrency wallet to interact with blockchain networks. This is completely optional.
                </p>
                <Button onClick={createWallet} disabled={isCreating || isLoadingFromDatabase} className="gap-2">
                  <Plus className="w-4 h-4" />
                  {isLoadingFromDatabase ? "Checking..." : "Create Wallet"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Wallet Features Card */}
        <Card>
          <CardHeader>
            <CardTitle>Why Create a Wallet?</CardTitle>
            <CardDescription>
              Optional features available with a wallet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium mb-2">Multi-Chain Support</h3>
                <p className="text-sm text-muted-foreground">
                  Support for Ethereum, Polygon, and other networks
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium mb-2">Secure & Custodial</h3>
                <p className="text-sm text-muted-foreground">
                  Your keys are securely managed by Crossmint
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium mb-2">Easy Integration</h3>
                <p className="text-sm text-muted-foreground">
                  Seamlessly integrated with your existing account
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium mb-2">Send & Receive</h3>
                <p className="text-sm text-muted-foreground">
                  Send and receive cryptocurrencies easily
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium mb-2">DeFi Ready</h3>
                <p className="text-sm text-muted-foreground">
                  Interact with decentralized finance protocols
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium mb-2">NFT Support</h3>
                <p className="text-sm text-muted-foreground">
                  Store and manage your NFT collection
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions Card - Only show if wallet exists */}
        {hasWallet && userWallet && (
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common wallet operations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="outline" className="justify-start gap-2" disabled>
                  <Copy className="w-4 h-4" />
                  Send Crypto
                  <Badge variant="secondary" className="ml-auto">Soon</Badge>
                </Button>
                <Button variant="outline" className="justify-start gap-2" disabled>
                  <ExternalLink className="w-4 h-4" />
                  Receive Crypto
                  <Badge variant="secondary" className="ml-auto">Soon</Badge>
                </Button>
                <Button variant="outline" className="justify-start gap-2" disabled>
                  <Wallet className="w-4 h-4" />
                  View Balance
                  <Badge variant="secondary" className="ml-auto">Soon</Badge>
                </Button>
                <Button variant="outline" className="justify-start gap-2" disabled>
                  <AlertCircle className="w-4 h-4" />
                  Transaction History
                  <Badge variant="secondary" className="ml-auto">Soon</Badge>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Send Transaction Card - Only show if wallet exists */}
        {hasWallet && userWallet && (
          <Card>
            <CardHeader>
                          <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Send SOL
            </CardTitle>
            <CardDescription>
              Send real Solana (SOL) to another wallet address - This will execute actual transactions!
            </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-sm font-medium text-orange-800">⚠️ Real Transaction Warning</p>
                  <p className="text-xs text-orange-700">This will send actual SOL from your wallet. Transactions cannot be reversed!</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recipient">Recipient Address</Label>
                  <Input
                    id="recipient"
                    placeholder="Enter Solana wallet address"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (SOL)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.001"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={sendTransaction} 
                  disabled={isSending || !recipientAddress || !amount}
                  className="w-full gap-2"
                >
                  <Send className="w-4 h-4" />
                  {isSending ? "Sending Real SOL..." : "Send Real SOL"}
                </Button>
                
                {lastTransaction && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-800 mb-2">Transaction Completed!</p>
                    <p className="text-xs text-green-700 mb-2">
                      {lastTransaction.hash.startsWith('demo') || lastTransaction.hash.startsWith('rest_api') ? 
                        "⚠️ Demo transaction - no actual SOL was sent" : 
                        "✅ Real SOL transaction submitted to the blockchain"
                      }
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs text-green-700">
                        Hash: <code className="text-xs">{lastTransaction.hash}</code>
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-green-700"
                        onClick={() => window.open(lastTransaction.explorerLink, '_blank')}
                      >
                        View on Explorer <ExternalLink className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
} 