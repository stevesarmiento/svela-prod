"use client";

import { useState, useEffect } from "react";
import { useUserSettings } from "@/hooks/use-user-settings";
import { Button } from "@v1/ui/button";
import { Input } from "@v1/ui/input";
import { Badge } from "@v1/ui/badge";
import { Switch } from "@v1/ui/switch";
import { Separator } from "@v1/ui/separator";
import { cn } from "@v1/ui/cn";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@v1/ui/alert-dialog";
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
    validateApiKey,
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
        <div className="rounded-[10px] bg-primary/5 overflow-hidden p-0.5">
          <div className="px-3 py-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              <span>API Keys</span>
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
      const providerName = providers.find(p => p.id === provider)?.name ?? provider;
      await addApiKey(provider, `My ${providerName} Key`, apiKey.trim());
      
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
              <span>API Keys</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 space-y-4">
            {/* Intro */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1 shrink-0">
                  <Shield className="h-4 w-4 dark:fill-white/50 fill-zinc-950/50" />
                </div>
                <div className="space-y-0.5">
                  <div className="font-bold text-xs text-balance">Bring your own API keys</div>
                  <div className="text-primary/40 text-xs text-pretty">
                    Use your personal quotas and higher rate limits. Keys are validated before saving and encrypted at rest.
                  </div>
                </div>
              </div>
              <Badge variant="tag" className="shrink-0">
                Encrypted
              </Badge>
            </div>

            <Separator className="bg-primary/5 scale-125" />

            {/* Provider List with Inputs */}
            <div className="rounded-lg border border-primary/5 overflow-hidden">
              <div className="divide-y divide-primary/5">
                {providers.map((provider) => {
                  const existingKey = apiKeys?.find((k) => k.provider === provider.id);
                  const inputValue = apiKeyInputs[provider.id] || "";
                  const isSubmittingThis = isSubmitting[provider.id];
                  const validationError = validationErrors[provider.id];

                  const isOptimisticKey = Boolean(
                    existingKey &&
                      typeof existingKey === "object" &&
                      "isOptimistic" in existingKey &&
                      Boolean(existingKey.isOptimistic),
                  );

                  const statusBadge = existingKey
                    ? isOptimisticKey
                      ? { label: "Saving...", variant: "secondary" as const }
                      : existingKey.isActive
                        ? { label: "Active", variant: "success" as const }
                        : { label: "Inactive", variant: "outline" as const }
                    : { label: "Not set", variant: "outline" as const };

                  return (
                    <div key={provider.id} className="p-3">
                      {/* Provider row */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 min-w-0">
                          <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1 shrink-0">
                            <Key className="h-4 w-4 dark:fill-white/50 fill-zinc-950/50" />
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="font-bold text-xs truncate">{provider.name}</div>
                              <Badge variant={statusBadge.variant} className="text-[10px]">
                                {statusBadge.label}
                              </Badge>
                            </div>
                            <div className="text-primary/40 text-xs text-pretty">{provider.description}</div>
                          </div>
                        </div>

                        {existingKey ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <Switch
                              aria-label={`${provider.name} API key active`}
                              checked={existingKey.isActive}
                              disabled={isOptimisticKey}
                              onCheckedChange={() => handleToggleActive(provider.id)}
                            />

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  aria-label={`Remove ${provider.name} API key`}
                                  disabled={isOptimisticKey}
                                  className="h-8 w-8"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-xl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove {provider.name} API key?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This deletes the key from your account. You can add it again later.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction asChild>
                                    <Button variant="destructive" onClick={() => handleRemoveKey(provider.id)}>
                                      Remove key
                                    </Button>
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        ) : null}
                      </div>

                      {/* Add key (only when not set) */}
                      {!existingKey ? (
                        <div className="mt-3 space-y-2">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Input
                              type="password"
                              autoComplete="off"
                              spellCheck={false}
                              aria-label={`${provider.name} API key`}
                              placeholder={`Paste your ${provider.name} API key`}
                              value={inputValue}
                              onChange={(e) => {
                                handleInputChange(provider.id, e.target.value);
                                if (validationError) {
                                  setValidationErrors((prev) => ({ ...prev, [provider.id]: "" }));
                                }
                              }}
                              className={cn(
                                "text-xs flex-1",
                                validationError && "border-rose-500 focus:border-rose-500",
                              )}
                            />

                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => handleSubmitKey(provider.id)}
                                disabled={!inputValue.trim() || isSubmittingThis}
                                size="sm"
                                className="h-9 text-xs whitespace-nowrap"
                              >
                                {isSubmittingThis ? "Validating..." : "Save"}
                              </Button>
                              {inputValue.trim() ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => clearInput(provider.id)}
                                  aria-label={`Clear ${provider.name} API key input`}
                                  className="h-9 text-xs"
                                >
                                  Clear
                                </Button>
                              ) : null}
                            </div>
                          </div>

                          {validationError ? (
                            <div className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-md px-2 py-1">
                              {validationError}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-3 space-y-1">
                          <div className="text-[10px] text-primary/30">Stored key</div>
                          <div className="font-diatype-mono text-[10px] text-primary/30">
                            {"displayKey" in existingKey
                              ? existingKey.displayKey || "key...hidden"
                              : "key...hidden"}
                          </div>
                          {"validationError" in existingKey && existingKey.validationError ? (
                            <div className="mt-2 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-md px-2 py-1">
                              {existingKey.validationError}
                            </div>
                          ) : null}
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
    </div>
  );
}
