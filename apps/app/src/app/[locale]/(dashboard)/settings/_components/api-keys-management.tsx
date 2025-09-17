"use client";

import { useState, useEffect } from "react";
import { useUserSettings } from "@/hooks/use-user-settings";
import { Button } from "@v1/ui/button";
import { Input } from "@v1/ui/input";
import { Badge } from "@v1/ui/badge";
import { Switch } from "@v1/ui/switch";
import { Trash2, Shield, Key } from "lucide-react";
import type { ApiProvider } from "@/../convex/apiKeys";


export function ApiKeysManagement() {
  const { 
    apiKeys, 
    isApiKeysLoading, 
    getApiProviders,
    addApiKey,
    removeApiKey,
    updateApiKeyActiveStatus,
    validateApiKey 
  } = useUserSettings();
  
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<Record<string, boolean>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);

  // Ensure component is mounted before rendering dynamic content
  useEffect(() => {
    setMounted(true);
  }, []);

  // Show loading state during SSR and initial load
  if (!mounted || isApiKeysLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-[12px] bg-primary/5 overflow-hidden p-0.5">
          <div className="px-3 py-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              <div className="flex items-center gap-2">
                <Shield className="h-3 w-3" />
                <span>API Keys Configuration</span>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
            <div className="p-4">
              <div className="text-xs text-muted-foreground">Loading API keys...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const providers = getApiProviders();

  const handleInputChange = (provider: string, value: string) => {
    setApiKeyInputs(prev => ({ ...prev, [provider]: value }));
  };

  const clearInput = (provider: string) => {
    setApiKeyInputs(prev => ({ ...prev, [provider]: '' }));
  };

  const handleSubmitKey = async (provider: ApiProvider) => {
    const apiKey = apiKeyInputs[provider];
    if (!apiKey?.trim()) return;

    setIsSubmitting(prev => ({ ...prev, [provider]: true }));
    setValidationErrors(prev => ({ ...prev, [provider]: '' }));
    
    try {
      // Validate the API key before adding it
      const validationResult = await validateApiKey(provider, apiKey.trim());
      
      if (!validationResult.isValid) {
        setValidationErrors(prev => ({ 
          ...prev, 
          [provider]: validationResult.error || 'API key validation failed' 
        }));
        return;
      }
      
      // Add the validated API key
      await addApiKey(provider, `My ${providers.find(p => p.id === provider)?.name} Key`, apiKey.trim());
      
      // Clear input and validation errors on success
      setApiKeyInputs(prev => ({ ...prev, [provider]: '' }));
      setValidationErrors(prev => ({ ...prev, [provider]: '' }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add API key';
      setValidationErrors(prev => ({ ...prev, [provider]: errorMessage }));
    } finally {
      setIsSubmitting(prev => ({ ...prev, [provider]: false }));
    }
  };

  const handleRemoveKey = async (provider: ApiProvider) => {
    const apiKey = apiKeys?.find(k => k.provider === provider);
    if (!apiKey) return;
    
    const providerConfig = providers.find(p => p.id === provider);
    if (!providerConfig) return;

    await removeApiKey(apiKey._id, providerConfig.name);
  };

  const handleToggleActive = async (provider: ApiProvider) => {
    const apiKey = apiKeys?.find(k => k.provider === provider);
    if (!apiKey) return;
    
    await updateApiKeyActiveStatus(apiKey._id, !apiKey.isActive);
  };


  return (
    <div className="space-y-4">
      {/* API Keys Management Card */}
      <div className="rounded-[10px] bg-primary/5 overflow-hidden p-0.5">
        {/* Header */}
        <div className="px-3 py-2">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="flex items-center gap-2">
              <span>API Keys Configuration</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 space-y-4">
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                Add your own API keys to use personal quotas and higher rate limits. 
                All keys are encrypted before storage for maximum security.
              </p>
            </div>

            {/* Provider List with Inputs */}
            <div className="space-y-3">
              {providers.map((provider) => {
                const existingKey = apiKeys?.find(k => k.provider === provider.id);
                const inputValue = apiKeyInputs[provider.id] || '';
                const isSubmittingThis = isSubmitting[provider.id];

                const validationError = validationErrors[provider.id];
                
                return (
                  <div key={provider.id} className="p-3 bg-primary/5 rounded-lg space-y-3">
                    {/* Provider Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1">
                          <Key className="h-4 w-4 dark:fill-white/50 fill-zinc-950/50" />
                        </div>
                        <div>
                          <div className="font-bold text-xs">{provider.name}</div>
                          <div className="text-primary/40 text-xs">{provider.description}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {existingKey ? (
                          <>
                            <Badge 
                              variant={existingKey.isActive ? "default" : "secondary"} 
                              className="text-[10px] h-5"
                            >
                              {existingKey.isActive ? "Active" : "Inactive"}
                            </Badge>
                            <Switch
                              checked={existingKey.isActive}
                              onCheckedChange={() => handleToggleActive(provider.id)}
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleRemoveKey(provider.id)}
                              className="h-7 w-7"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => clearInput(provider.id)}
                            className="h-7 text-xs"
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* API Key Input (always visible when no existing key) */}
                    {!existingKey && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            placeholder={`Enter your ${provider.name} API key...`}
                            value={inputValue}
                            onChange={(e) => {
                              handleInputChange(provider.id, e.target.value);
                              // Clear validation error when user starts typing
                              if (validationError) {
                                setValidationErrors(prev => ({ ...prev, [provider.id]: '' }));
                              }
                            }}
                            className={`text-xs flex-1 ${validationError ? 'border-red-500 focus:border-red-500' : ''}`}
                          />
                          <Button
                            onClick={() => handleSubmitKey(provider.id)}
                            disabled={!inputValue.trim() || isSubmittingThis}
                            size="sm"
                            className="h-9 text-xs whitespace-nowrap"
                          >
                            {isSubmittingThis ? "Validating..." : "Save"}
                          </Button>
                        </div>
                        
                        {/* Validation Error Display */}
                        {validationError && (
                          <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-2 py-1">
                            <div className="font-medium">Validation Error:</div>
                            <div>{validationError}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Existing Key Display */}
                    {existingKey && (
                      <div className="text-[10px] text-primary/30">
                        <div className="font-mono mb-1">{existingKey.displayKey || 'key...hidden'}</div>
                        {existingKey.validationError && (
                          <div className="text-red-400">Error: {existingKey.validationError}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
