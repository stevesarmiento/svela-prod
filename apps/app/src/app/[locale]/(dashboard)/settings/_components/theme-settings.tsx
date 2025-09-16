'use client';

import { useState, useEffect } from 'react';

import { Separator } from '@v1/ui/separator';
import { IconPaintbrushFill, IconSunMaxFill, IconMoonStarsFill } from 'symbols-react';
import { useAuth } from '@v1/convex/hooks';
import { toast } from 'sonner';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useTheme } from 'next-themes';
import { cn } from '@v1/ui/cn';

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
        return <IconSunMaxFill className="h-4 w-4 fill-amber-500" />;
      case 'dark':
        return <IconMoonStarsFill className="h-4 w-4 fill-blue-500" />;
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
      <div className="rounded-[10px] bg-primary/5 overflow-hidden p-0.5">
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
            
            <Separator className="bg-primary/5 scale-125" />
            
            {/* Theme Selection Header */}
            <div className="flex items-center gap-4">
              <div className="bg-white/5 h-8 w-8 flex items-center justify-center rounded-lg p-1">
                <IconPaintbrushFill className="h-5 w-5 dark:fill-white/50 fill-zinc-950/50" />
              </div>
              <div className="">
                <div className="font-bold text-xs">Theme Preference</div>
                <div className="text-primary/40 text-xs">
                  Choose your preferred color scheme for the application interface.
                </div>
              </div>                
            </div>

            {/* Theme Grid */}
            <div className="grid grid-cols-3 gap-6">
              {/* System Theme */}
              <div 
                className={cn(
                  "relative cursor-pointer rounded-xl p-3 h-32 transition-all duration-200  group overflow-hidden bg-gradient-to-br from-slate-50 to-slate-200",
                  selectedTheme === 'system' 
                    ? "ring-4 ring-offset-4 ring-primary/20 ring-offset-background" 
                    : "hover:ring-4 hover:ring-primary/10 ring-offset-background ring-offset-4"
                )}
                onClick={() => handleThemeChange('system')}
              >
                {/* Mini UI representation */}
                <div className="absolute inset-2 top-4 left-24">
                  {/* Header */}
                  <div className="w-full h-2 bg-white/80 rounded-t mb-1 flex items-center px-1">
                    <div className="w-1 h-1 bg-rose-400 rounded-full"></div>
                    <div className="w-1 h-1 bg-amber-400 rounded-full ml-0.5"></div>
                    <div className="w-1 h-1 bg-emerald-400 rounded-full ml-0.5"></div>
                  </div>
                  {/* Content area */}
                  <div className="w-full h-24 flex-1 bg-white/60 rounded-b p-1">
                    <div className="w-3/4 h-1 bg-slate-300 rounded mb-1"></div>
                    <div className="w-1/2 h-1 bg-slate-300 rounded"></div>
                  </div>
                  {/* System icon overlay */}
                  <div className="absolute bottom-1 right-1">
                    <div className="w-4 h-4 bg-slate-600 rounded flex items-center justify-center">
                      <span className="text-white text-[6px] font-mono">SYS</span>
                    </div>
                  </div>
                </div>
                
                {/* Text in top-left */}
                <div className="absolute top-2 left-2 text-left z-10">
                  <div className="text-xs font-medium text-slate-900">System</div>
                  <div className="text-[10px] text-slate-700">Auto</div>
                </div>
              </div>

              {/* Light Theme */}
              <div 
                className={cn(
                  "relative cursor-pointer rounded-xl p-3 h-32 transition-all duration-200  group overflow-hidden bg-white",
                  selectedTheme === 'light' 
                    ? "ring-4 ring-offset-4 ring-primary/20 ring-offset-background" 
                    : "hover:ring-4 hover:ring-primary/10 ring-offset-background ring-offset-4"
                )}
                onClick={() => handleThemeChange('light')}
              >
                {/* Mini UI representation */}
                <div className="absolute inset-2 top-4 left-24">
                  {/* Header */}
                  <div className="w-full h-2 bg-white/80 rounded-t mb-1 flex items-center px-1">
                    <div className="w-1 h-1 bg-rose-400 rounded-full"></div>
                    <div className="w-1 h-1 bg-amber-400 rounded-full ml-0.5"></div>
                    <div className="w-1 h-1 bg-emerald-400 rounded-full ml-0.5"></div>
                  </div>
                  {/* Content area */}
                  <div className="w-full h-24 flex-1 bg-gray-50 rounded-b p-1">
                    <div className="w-3/4 h-1 bg-gray-300 rounded mb-1"></div>
                    <div className="w-1/2 h-1 bg-gray-300 rounded mb-1"></div>
                    <div className="w-full h-2 bg-blue-100 rounded mt-1"></div>
                  </div>
                  {/* Sun icon overlay */}
                  <div className="absolute bottom-1 right-1">
                    <IconSunMaxFill className="w-4 h-4 fill-amber-500" />
                  </div>
                </div>
                
                {/* Text in top-left */}
                <div className="absolute top-2 left-2 text-left z-10">
                  <div className="text-xs font-medium text-zinc-900">Light</div>
                  <div className="text-[10px] text-zinc-600">Bright</div>
                </div>
              </div>

              {/* Dark Theme */}
              <div 
                className={cn(
                  "relative cursor-pointer rounded-xl p-3 h-32 transition-all duration-200  group overflow-hidden bg-zinc-900",
                  selectedTheme === 'dark' 
                    ? "ring-4 ring-offset-4 ring-primary/20 ring-offset-background" 
                    : "hover:ring-4 hover:ring-primary/10 ring-offset-background ring-offset-4"
                )}
                onClick={() => handleThemeChange('dark')}
              >
                {/* Mini UI representation */}
                <div className="absolute inset-2 top-4 left-24">
                  {/* Header */}
                  <div className="w-full h-2 bg-white/80 rounded-t mb-1 flex items-center px-1">
                    <div className="w-1 h-1 bg-rose-400 rounded-full"></div>
                    <div className="w-1 h-1 bg-amber-400 rounded-full ml-0.5"></div>
                    <div className="w-1 h-1 bg-emerald-400 rounded-full ml-0.5"></div>
                  </div>
                  {/* Content area */}
                  <div className="w-full h-24 flex-1 bg-zinc-800/60 rounded-b p-1">
                    <div className="w-3/4 h-1 bg-zinc-600 rounded mb-1"></div>
                    <div className="w-1/2 h-1 bg-zinc-600 rounded mb-1"></div>
                    <div className="w-full h-2 bg-blue-900/50 rounded mt-1"></div>
                  </div>
                  {/* Moon icon overlay */}
                  <div className="absolute bottom-1 right-1">
                    <IconMoonStarsFill className="w-4 h-4 fill-blue-500" />
                  </div>
                </div>
                
                {/* Text in top-left */}
                <div className="absolute top-2 left-2 text-left z-10">
                  <div className="text-xs font-medium text-white">Dark</div>
                  <div className="text-[10px] text-zinc-400">Night</div>
                </div>
              </div>

              {/* Sunrise Theme */}
              <div 
                className={cn(
                  "relative cursor-pointer rounded-xl p-3 h-32 transition-all duration-200  group overflow-hidden",
                  selectedTheme === 'sunrise' 
                    ? "ring-4 ring-offset-4 ring-primary/20 ring-offset-white dark:ring-offset-background" 
                    : "hover:ring-4 hover:ring-primary/10 ring-offset-white dark:ring-offset-background ring-offset-4"
                )}
                onClick={() => handleThemeChange('sunrise')}
                style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%)' }}
              >
                {/* Mini UI representation */}
                <div className="absolute inset-2 top-4 left-24">
                  {/* Header */}
                  <div className="w-full h-2 bg-white/80 rounded-t mb-1 flex items-center px-1">
                    <div className="w-1 h-1 bg-rose-400 rounded-full"></div>
                    <div className="w-1 h-1 bg-amber-400 rounded-full ml-0.5"></div>
                    <div className="w-1 h-1 bg-emerald-400 rounded-full ml-0.5"></div>
                  </div>
                  {/* Content area */}
                  <div className="w-full h-24 flex-1 bg-yellow-100/80 rounded-b p-1">
                    <div className="w-3/4 h-1 bg-orange-300 rounded mb-1"></div>
                    <div className="w-1/2 h-1 bg-orange-300 rounded mb-1"></div>
                    <div className="w-full h-2 bg-gradient-to-r from-orange-200 to-yellow-200 rounded mt-1"></div>
                  </div>
                  {/* Sunrise icon overlay */}
                  <div className="absolute bottom-1 right-1">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-r from-orange-400 to-yellow-400"></div>
                  </div>
                </div>
                
                {/* Text in top-left */}
                <div className="absolute top-2 left-2 text-left z-10">
                  <div className="text-xs font-medium text-orange-900">Sunrise</div>
                  <div className="text-[10px] text-orange-700">Warm</div>
                </div>
              </div>

              {/* Cherry Theme */}
              <div 
                className={cn(
                  "relative cursor-pointer rounded-xl p-3 h-32 transition-all duration-200  group overflow-hidden",
                  selectedTheme === 'cherry' 
                  ? "ring-4 ring-offset-4 ring-primary/20 ring-offset-white dark:ring-offset-background" 
                  : "hover:ring-4 hover:ring-primary/10 ring-offset-white dark:ring-offset-background ring-offset-4"
              )}
                onClick={() => handleThemeChange('cherry')}
                style={{ background: 'linear-gradient(135deg, #fce7f3 0%, #fecaca 100%)' }}
              >
                {/* Mini UI representation */}
                <div className="absolute inset-2 top-4 left-24">
                  {/* Header */}
                  <div className="w-full h-2 bg-white/80 rounded-t mb-1 flex items-center px-1">
                    <div className="w-1 h-1 bg-rose-400 rounded-full"></div>
                    <div className="w-1 h-1 bg-amber-400 rounded-full ml-0.5"></div>
                    <div className="w-1 h-1 bg-emerald-400 rounded-full ml-0.5"></div>
                  </div>
                  {/* Content area */}
                  <div className="w-full h-24 flex-1 bg-rose-100/80 rounded-b p-1">
                    <div className="w-3/4 h-1 bg-pink-300 rounded mb-1"></div>
                    <div className="w-1/2 h-1 bg-pink-300 rounded mb-1"></div>
                    <div className="w-full h-2 bg-gradient-to-r from-pink-200 to-red-200 rounded mt-1"></div>
                  </div>
                  {/* Cherry icon overlay */}
                  <div className="absolute bottom-1 right-1">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-r from-pink-400 to-red-400"></div>
                  </div>
                </div>
                
                {/* Text in top-left */}
                <div className="absolute top-2 left-2 text-left z-10">
                  <div className="text-xs font-medium text-rose-900">Cherry</div>
                  <div className="text-[10px] text-rose-700">Rose</div>
                </div>
              </div>

              {/* Blueberry Theme */}
              <div 
                className={cn(
                  "relative cursor-pointer rounded-xl p-3 h-32 transition-all duration-200  group overflow-hidden",
                  selectedTheme === 'blueberry' 
                  ? "ring-4 ring-offset-4 ring-primary/20 ring-offset-white dark:ring-offset-background" 
                  : "hover:ring-4 hover:ring-primary/10 ring-offset-white dark:ring-offset-background ring-offset-4"
              )}
                onClick={() => handleThemeChange('blueberry')}
                style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%)' }}
              >
                {/* Mini UI representation */}
                <div className="absolute inset-2 top-4 left-24">
                  {/* Header */}
                  <div className="w-full h-2 bg-white/80 rounded-t mb-1 flex items-center px-1">
                    <div className="w-1 h-1 bg-rose-400 rounded-full"></div>
                    <div className="w-1 h-1 bg-amber-400 rounded-full ml-0.5"></div>
                    <div className="w-1 h-1 bg-emerald-400 rounded-full ml-0.5"></div>
                  </div>
                  {/* Content area */}
                  <div className="w-full h-24 flex-1 bg-indigo-100/80 rounded-b p-1">
                    <div className="w-3/4 h-1 bg-blue-300 rounded mb-1"></div>
                    <div className="w-1/2 h-1 bg-blue-300 rounded mb-1"></div>
                    <div className="w-full h-2 bg-gradient-to-r from-blue-200 to-purple-200 rounded mt-1"></div>
                  </div>
                  {/* Blueberry icon overlay */}
                  <div className="absolute bottom-1 right-1">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-r from-blue-400 to-purple-400"></div>
                  </div>
                </div>
                
                {/* Text in top-left */}
                <div className="absolute top-2 left-2 text-left z-10">
                  <div className="text-xs font-medium text-blue-900">Blueberry</div>
                  <div className="text-[10px] text-blue-700">Cool</div>
                </div>
              </div>

              {/* Empty slots for 3x2 grid completion */}
              <div></div>
              <div></div>
              <div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 