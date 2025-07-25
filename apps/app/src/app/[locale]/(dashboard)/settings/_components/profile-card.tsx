'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@v1/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@v1/ui/avatar';
import { IconSparkle } from 'symbols-react';
import { useAuth } from '@v1/convex/hooks';


// Noise/texture overlay component
function NoiseTexture() {
  return (
    <div 
      className="absolute inset-0 opacity-100 mix-blend-soft-light"
      style={{
        backgroundImage: `
          radial-gradient(circle at 20% 30%, rgba(255,255,255,0.1) 1px, transparent 1px),
          radial-gradient(circle at 80% 70%, rgba(255,255,255,0.08) 1px, transparent 1px),
          radial-gradient(circle at 40% 80%, rgba(255,255,255,0.06) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px, 60px 60px, 80px 80px'
      }}
    />
  );
}

export function ProfileCard() {
  const { user } = useAuth();

  // Initialize with default values to prevent hydration mismatch
  const [userStats, setUserStats] = useState(() => ({
    memberSince: new Date('2024-01-01'), // Default fallback date
    isProMember: false,
    isTrialActive: false,
    trialDaysRemaining: 0,
    totalCharts: 0,
    totalWatchlists: 0,
    totalMemories: 0
  }));

  // Set actual values after component mounts to avoid hydration mismatch
  useEffect(() => {
    const memberSince = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000);
    const trialEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const daysRemaining = Math.ceil((trialEndDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    
    setUserStats({
      memberSince,
      isProMember: Math.random() > 0.7, // 30% chance of being pro for demo
      isTrialActive: !!(Math.random() > 0.5 && daysRemaining > 0),
      trialDaysRemaining: Math.max(0, daysRemaining),
      totalCharts: Math.floor(Math.random() * 50) + 10,
      totalWatchlists: Math.floor(Math.random() * 8) + 2,
      totalMemories: Math.floor(Math.random() * 200) + 50
    });
  }, []);

  const getMembershipStatus = () => {
    if (userStats.isProMember) {
      return { label: 'Pro Member', color: 'text-amber-300', bg: 'bg-amber-500/20 border-amber-400/40' };
    }
    if (userStats.isTrialActive) {
      return { label: `Trial • ${userStats.trialDaysRemaining}d left`, color: 'text-blue-300', bg: 'bg-blue-500/20 border-blue-400/40' };
    }
    return { label: 'Free Tier', color: 'text-zinc-400', bg: 'bg-zinc-500/20 border-zinc-400/30' };
  };

  const membershipStatus = getMembershipStatus();

  // Premium platinum gradient for pro members
  const premiumGradient = userStats.isProMember
    ? 'from-gray-200 via-gray-300 to-gray-400'
    : userStats.isTrialActive
    ? 'from-blue-200 via-indigo-300 to-purple-400'
    : 'from-zinc-700 via-zinc-800 to-zinc-900';

  return (
    <div className="sticky top-6 ">
      {/* Main container with price-chart styling */}
      <div className="bg-zinc-950/50 backdrop-blur-xl border border-zinc-800/30 rounded-[20px] overflow-hidden shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-4px_30px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),inset_0_-4px_1990px_rgba(47,44,48,0.3),0_4px_16px_rgba(0,0,0,0.6)]">
        <div className="p-0 relative">          
          <Card className="border-none bg-transparent">
            {/* Base premium gradient background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${premiumGradient} opacity-90`} />
            
            {/* Noise texture overlay */}
            <NoiseTexture />
            
            {/* Content overlay with proper contrast */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

            {/* Header section with decorative elements */}
            <div className="relative h-28 bg-gradient-to-br from-black/50 to-transparent border-b border-white/10">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(120,119,198,0.4),transparent_70%)]" />
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <IconSparkle className="w-5 h-5 text-emerald-300/70" />
                {userStats.isProMember && (
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 shadow-lg" />
                )}
              </div>
              
              {/* Membership tier indicator */}
              <div className="absolute bottom-4 left-4">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border backdrop-blur-sm ${membershipStatus.bg} ${membershipStatus.color}`}>
                  {userStats.isProMember && <IconSparkle className="w-3 h-3" />}
                  {membershipStatus.label}
                </div>
              </div>
            </div>

            <CardHeader className="relative -mt-12 pb-4">
              <div className="flex flex-col items-center">
                {/* Premium avatar with enhanced styling */}
                <div className="relative">
                  <Avatar className="w-20 h-20 rounded-[20px] mb-4 border border-white/30 bg-gradient-to-br from-zinc-700 to-zinc-900 shadow-xl">
                    <AvatarImage 
                      src={user?.avatarUrl || ''} 
                      alt={user?.fullName || 'User'} 
                    />
                    <AvatarFallback className="bg-gradient-to-br from-zinc-700 to-zinc-800 text-white text-lg font-bold">
                      {user?.fullName?.charAt(0) || user?.email?.charAt(0) || '🧠'}
                    </AvatarFallback>
                  </Avatar>
                  
                  {/* Floating status indicator */}
                  {userStats.isProMember && (
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full flex items-center justify-center shadow-lg">
                      <IconSparkle className="w-3 h-3 text-amber-900" />
                    </div>
                  )}
                </div>
                
                <CardTitle className="text-xl text-white mb-2 text-center font-bold">
                  {user?.fullName || user?.email?.split('@')[0] || 'Crypto Trader'}
                </CardTitle>
                
                <p className="text-white/60 text-xs text-center mb-4">
                  Member since {userStats.memberSince.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </p>
              </div>
            </CardHeader>

            <CardContent className="relative pt-0 pb-6">
              {/* Premium app description */}
              <div className="text-center text-white/80 text-sm leading-relaxed mb-6 px-2">
                <p className="mb-3 font-medium">
                  Advanced crypto analytics platform with AI-powered insights and personalized trading intelligence.
                </p>
                {userStats.isTrialActive && (
                  <p className="text-blue-300 text-xs font-semibold bg-blue-500/20 rounded-lg px-3 py-2 border border-blue-400/30">
                    🎯 Trial expires in {userStats.trialDaysRemaining} days
                  </p>
                )}
                {!userStats.isProMember && !userStats.isTrialActive && (
                  <p className="text-zinc-400 text-xs bg-zinc-500/20 rounded-lg px-3 py-2 border border-zinc-400/30">
                    Upgrade to Pro for advanced features
                  </p>
                )}
              </div>

              {/* Enhanced feature highlights */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-white/70">
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-400 to-green-300 shadow-sm"></div>
                  <span>Real-time market data</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-white/70">
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-cyan-300 shadow-sm"></div>
                  <span>AI-powered chat assistant</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-white/70">
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-400 to-pink-300 shadow-sm"></div>
                  <span>Custom watchlists & charts</span>
                </div>
                {userStats.isProMember && (
                  <div className="flex items-center gap-3 text-sm text-amber-300">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 shadow-amber-400/50 shadow-sm"></div>
                    <span className="font-medium">Pro analytics & alerts</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <style jsx>{`
        @keyframes stripe-flow {
          0% { transform: translateX(0); }
          100% { transform: translateX(20px); }
        }
      `}</style>
    </div>
  );
} 