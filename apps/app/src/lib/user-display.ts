export function formatWalletAddress(address?: string | null): string {
  const value = address?.trim();
  if (!value) return "";
  if (value.length <= 8) return value;
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

export function getUserDisplayName(input: {
  fullName?: string | null;
  email?: string | null;
  walletAddress?: string | null;
  fallback?: string;
}): string {
  const fullName = input.fullName?.trim();
  if (fullName) return fullName;

  const emailLocalPart = input.email?.split("@")[0]?.trim();
  if (emailLocalPart) return emailLocalPart;

  const formattedWalletAddress = formatWalletAddress(input.walletAddress);
  if (formattedWalletAddress) return formattedWalletAddress;

  return input.fallback ?? "User";
}
