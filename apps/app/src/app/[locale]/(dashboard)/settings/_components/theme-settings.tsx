'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@v1/ui/select';
import { Separator } from '@v1/ui/separator';
import { IconPaintbrushFill, IconSunMax, IconMoonStars } from 'symbols-react';
import { useAuth } from '@v1/convex/hooks';
import { toast } from 'sonner';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useTheme } from 'next-themes';

export function ThemeSettings() {
  const { user } = useAuth();
  const { updateSettings, settings } = useUserSettings();
  const { theme, setTheme } = useTheme();
  
  // Use local state to avoid hydration mismatches
  const [selectedTheme, setSelectedTheme] = useState('system');

  // Load settings after hydration
  useEffect(() => {
    if (settings?.theme) {
      setSelectedTheme(settings.theme);
    } else if (theme) {
      setSelectedTheme(theme);
    }
  }, [settings?.theme, theme]);

  // Handle theme change
  const handleThemeChange = async (newTheme: string) => {
    setSelectedTheme(newTheme); // Update local state immediately
    
    // Clean theme switching - ensure previous theme classes are removed
    const htmlElement = document.documentElement;
    const allThemes = ['light', 'dark', 'sunrise', 'cherry', 'blueberry'];
    
    // Remove all theme classes first
    allThemes.forEach(theme => {
      htmlElement.classList.remove(theme);
    });
    
    // Apply new theme
    setTheme(newTheme); // Update next-themes
    
    // For non-system themes, explicitly add the class
    if (newTheme !== 'system') {
      // Small delay to ensure next-themes has processed
      setTimeout(() => {
        if (!htmlElement.classList.contains(newTheme)) {
          htmlElement.classList.add(newTheme);
        }
      }, 50);
    }
    
    if (user?.id) {
      await updateSettings({ theme: newTheme });
      toast.success(`Theme updated to ${newTheme === 'system' ? 'system default' : newTheme}`);
    }
  };

  const getThemeIcon = (themeValue: string) => {
    switch (themeValue) {
      case 'light':
        return <IconSunMax className="h-4 w-4 fill-yellow-400" />;
      case 'dark':
        return <IconMoonStars className="h-4 w-4 fill-blue-400" />;
      case 'sunrise':
        return <div className="h-4 w-4 rounded-full bg-gradient-to-r from-orange-400 to-yellow-400"></div>;
      case 'cherry':
        return <div className="h-4 w-4 rounded-full bg-gradient-to-r from-pink-400 to-red-400"></div>;
      case 'blueberry':
        return <div className="h-4 w-4 rounded-full bg-gradient-to-r from-blue-400 to-purple-400"></div>;
      case 'system':
        return <span className="text-gray-400 text-xs font-mono">SYS</span>;
      default:
        return <span className="text-gray-400 text-xs font-mono">SYS</span>;
    }
  };

  const getThemeDescription = (themeValue: string) => {
    switch (themeValue) {
      case 'light':
        return 'Always use light mode';
      case 'dark':
        return 'Always use dark mode';
      case 'sunrise':
        return 'Warm orange and yellow tones';
      case 'cherry':
        return 'Rich pink and red colors';
      case 'blueberry':
        return 'Cool blue and purple hues';
      case 'system':
        return 'Follow system preference';
      default:
        return 'Follow system preference';
    }
  };

  return (
    <div className="space-y-4">
      {/* Theme Settings Card */}
      <div className="rounded-[12px] bg-primary/5 overflow-hidden p-0.5">
        {/* Header */}
        <div className="px-3 py-2">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="flex items-center gap-2">
              <span>Appearance & Theme</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-primary/5 border border-primary/5 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 space-y-4">
            {/* Theme Selection */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1">
                  <IconPaintbrushFill className="h-5 w-5 fill-white/50" />
                </div>
                <div className="">
                  <div className="font-bold text-xs">Theme Preference</div>
                  <div className="text-primary/40 text-xs">
                    Choose your preferred color scheme for the application interface.
                  </div>
                </div>                
              </div>

              <Select value={selectedTheme} onValueChange={handleThemeChange}>
                <SelectTrigger className="w-40 h-8 text-xs rounded-lg hover:bg-black/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 rounded-xl z-[101]">
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs font-mono">SYS</span>
                      System
                    </div>
                  </SelectItem>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <IconSunMax className="h-3 w-3 fill-yellow-400" />
                      Light
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <IconMoonStars className="h-3 w-3 fill-blue-400" />
                      Dark
                    </div>
                  </SelectItem>
                  <SelectItem value="sunrise">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-r from-orange-400 to-yellow-400"></div>
                      Sunrise
                    </div>
                  </SelectItem>
                  <SelectItem value="cherry">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-r from-pink-400 to-red-400"></div>
                      Cherry
                    </div>
                  </SelectItem>
                  <SelectItem value="blueberry">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-r from-blue-400 to-purple-400"></div>
                      Blueberry
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-primary/5 scale-125" />

            {/* Current Theme Display */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1">
                  {getThemeIcon(selectedTheme)}
                </div>
                <div className="">
                  <div className="font-bold text-xs">Current Setting</div>
                  <div className="text-primary/40 text-xs">
                    {getThemeDescription(selectedTheme)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedTheme.charAt(0).toUpperCase() + selectedTheme.slice(1)} Mode
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 