import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useAuth } from "@v1/convex/hooks";
import { toast } from "sonner";
import { API_PROVIDERS, type ApiProvider } from "@/../convex/apiKeys";
import type { Id } from "@/../convex/_generated/dataModel";

export function useUserSettings() {
  const { user } = useAuth();
  
  // Get settings from database
  const settings = useQuery(
    api.userSettings.getUserSettings,
    user?.id ? { clerkId: user.id } : "skip"
  );
  
  // Settings Mutations
  const upsertSettings = useMutation(api.userSettings.upsertUserSettings);
  const updateMemorySettings = useMutation(api.userSettings.updateMemorySettings);
  
  // API Key Mutations and Actions
  const addApiKeyAction = useAction(api.apiKeysActions.addApiKeyWithEncryption);
  const updateApiKeyStatus = useMutation(api.apiKeys.updateApiKeyStatus);
  const deleteApiKey = useMutation(api.apiKeys.deleteApiKey);
  
  // API Key Queries
  const apiKeys = useQuery(
    api.apiKeys.getUserApiKeys,
    user?.id ? { clerkId: user.id } : "skip"
  );
  
  const apiKeyStats = useQuery(
    api.apiKeys.getApiKeyStats,
    user?.id ? { clerkId: user.id } : "skip"
  );
  
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

  // API Key Management Functions
  const addApiKey = async (provider: ApiProvider, keyName: string, apiKey: string, isActive: boolean = true) => {
    if (!user?.id) {
      toast.error("Please sign in to manage API keys");
      return;
    }

    try {
      // Use Convex action for server-side encryption and storage
      await addApiKeyAction({
        clerkId: user.id,
        provider,
        keyName,
        apiKey,
        isActive,
      });
      
      const providerConfig = API_PROVIDERS[provider];
      toast.success(`${providerConfig.name} API key added successfully`);
      
      // Actions don't auto-refresh queries, so we need to reload
      window.location.reload();
    } catch (error) {
      console.error("Failed to add API key:", error);
      toast.error("Failed to add API key");
    }
  };

  const updateApiKeyActiveStatus = async (keyId: string, isActive: boolean) => {
    if (!user?.id) {
      toast.error("Please sign in to manage API keys");
      return;
    }

    try {
      await updateApiKeyStatus({
        clerkId: user.id,
        keyId: keyId as Id<"userApiKeys">,
        isActive,
      });
      
      toast.success(`API key ${isActive ? 'activated' : 'deactivated'}`);
      // No need to refresh - Convex queries auto-update!
    } catch (error) {
      console.error("Failed to update API key status:", error);
      toast.error("Failed to update API key status");
    }
  };

  const removeApiKey = async (keyId: string, providerName: string) => {
    if (!user?.id) {
      toast.error("Please sign in to manage API keys");
      return;
    }

    try {
      await deleteApiKey({
        clerkId: user.id,
        keyId: keyId as Id<"userApiKeys">,
      });
      
      toast.success(`${providerName} API key removed`);
      // No need to refresh - Convex queries auto-update!
    } catch (error) {
      console.error("Failed to remove API key:", error);
      toast.error("Failed to remove API key");
    }
  };

  // Validate an API key by testing it against the provider
  const validateApiKey = async (provider: ApiProvider, apiKey: string): Promise<boolean> => {
    const providerConfig = API_PROVIDERS[provider];
    
    // Basic format validation
    if (!providerConfig.keyPattern.test(apiKey)) {
      return false;
    }

    // TODO: Implement actual API validation by making test requests
    // This would require server-side validation to avoid exposing keys
    try {
      const response = await fetch('/api/validate-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      
      return response.ok;
    } catch {
      // For now, just return true if format is valid
      // Real validation should be implemented server-side
      return true;
    }
  };

  // Get available API providers with their current status
  const getApiProviders = () => {
    return Object.entries(API_PROVIDERS).map(([key, config]) => ({
      id: key as ApiProvider,
      ...config,
      hasKey: apiKeys?.some((apiKey) => apiKey.provider === key) ?? false,
      isActive: apiKeys?.some((apiKey) => apiKey.provider === key && apiKey.isActive) ?? false,
    }));
  };

  return {
    // Settings
    settings,
    isLoading: settings === undefined,
    updateMemory,
    updateSettings,
    getMemorySettings,
    
    // API Keys
    apiKeys,
    apiKeyStats,
    isApiKeysLoading: apiKeys === undefined,
    addApiKey,
    updateApiKeyActiveStatus,
    removeApiKey,
    validateApiKey,
    getApiProviders,
    API_PROVIDERS,
  };
} 