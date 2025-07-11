import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { recipientAddress, amount, walletAddress } = await request.json();

    // Validate inputs
    if (!recipientAddress || !amount || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: recipientAddress, amount, walletAddress' },
        { status: 400 }
      );
    }

    // Validate amount is positive
    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be positive' },
        { status: 400 }
      );
    }

    console.log("Transaction request:", {
      from: walletAddress,
      to: recipientAddress,
      amount
    });

    // For now, since the Crossmint REST API endpoints for transactions don't exist,
    // we'll create a mock transaction that shows what would happen
    console.log("Creating demo transaction (REST API endpoints not available)");
    
    const mockHash = `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const explorerLink = `https://explorer.solana.com/tx/${mockHash}?cluster=devnet`;
    
    return NextResponse.json({
      success: true,
      hash: mockHash,
      explorerLink,
      note: `Demo transaction: Would send ${amount} SOL from ${walletAddress} to ${recipientAddress}. Use Crossmint SDK for real transactions.`,
      amount,
      recipientAddress,
      walletAddress,
      instructions: [
        "To send real transactions, use the Crossmint React SDK:",
        "1. Ensure wallet is properly connected via SDK",
        "2. Use wallet.send(recipient, 'SOL', amount)",
        "3. Or use SolanaWallet.sendTransaction() with pre-built transaction"
      ]
    });

  } catch (error) {
    console.error('Transaction error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      note: "Transaction failed - check server logs for details"
    }, { status: 500 });
  }
} 