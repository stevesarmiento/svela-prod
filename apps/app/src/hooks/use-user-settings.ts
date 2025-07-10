import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useAuth } from "@v1/convex/hooks";
import { toast } from "sonner";

export function useUserSettings() {
  const { user } = useAuth();
  
  // Get settings from database
  const settings = useQuery(
    api.userSettings.getUserSettings,
    user?.id ? { clerkId: user.id } : "skip"
  );
  
  // Mutations
  const upsertSettings = useMutation(api.userSettings.upsertUserSettings);
  const updateMemorySettings = useMutation(api.userSettings.updateMemorySettings);
  
  // Update memory-specific settings
  const updateMemory = async (memorySettings: {
    memoryEnabled?: boolean;
    autoCleanupEnabled?: boolean;
    retentionDays?: string;
  }) => {
    if (!user?.id) {
      toast.error("Please sign in to save settings");
      return;
    }

    try {
      await updateMemorySettings({
        clerkId: user.id,
        ...memorySettings,
      });
      
      // Also sync to localStorage for immediate access (client-side only)
      if (typeof window !== 'undefined') {
        if (memorySettings.memoryEnabled !== undefined) {
          localStorage.setItem('memoryEnabled', memorySettings.memoryEnabled.toString());
        }
        if (memorySettings.autoCleanupEnabled !== undefined) {
          localStorage.setItem('autoCleanupEnabled', memorySettings.autoCleanupEnabled.toString());
        }
        if (memorySettings.retentionDays !== undefined) {
          localStorage.setItem('retentionDays', memorySettings.retentionDays);
        }
      }
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast.error("Failed to save settings");
    }
  };

  // Update any settings
  const updateSettings = async (newSettings: {
    memoryEnabled?: boolean;
    autoCleanupEnabled?: boolean;
    retentionDays?: string;
    theme?: string;
    currency?: string;
    dateFormat?: string;
    emailNotifications?: boolean;
    pushNotifications?: boolean;
    priceAlerts?: boolean;
    analyticsEnabled?: boolean;
    shareUsageData?: boolean;
  }) => {
    if (!user?.id) {
      toast.error("Please sign in to save settings");
      return;
    }

    try {
      await upsertSettings({
        clerkId: user.id,
        ...newSettings,
      });
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast.error("Failed to save settings");
    }
  };

  // Get memory settings with localStorage fallback for immediate access
  const getMemorySettings = () => {
    // If settings are loaded from DB, use those
    if (settings) {
      return {
        memoryEnabled: settings.memoryEnabled,
        autoCleanupEnabled: settings.autoCleanupEnabled,
        retentionDays: settings.retentionDays,
      };
    }

    // Check if we're on the client side before accessing localStorage
    if (typeof window === 'undefined') {
      // Return defaults during SSR
      return {
        memoryEnabled: true, // default true
        autoCleanupEnabled: false, // default false
        retentionDays: '30', // default 30
      };
    }

    // Fallback to localStorage while DB loads (client-side only)
    return {
      memoryEnabled: localStorage.getItem('memoryEnabled') !== 'false', // default true
      autoCleanupEnabled: localStorage.getItem('autoCleanupEnabled') === 'true', // default false
      retentionDays: localStorage.getItem('retentionDays') || '30', // default 30
    };
  };

  return {
    settings,
    isLoading: settings === undefined,
    updateMemory,
    updateSettings,
    getMemorySettings,
  };
} 