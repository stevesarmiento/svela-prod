'use client';

import { useState, useEffect } from 'react';

import { Separator } from '@v1/ui/separator';
import { IconSunMaxFill, IconMoonStarsFill } from 'symbols-react';
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
    const allThemes = ['light', 'dark'];
    
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

  // Theme configurations
  const themeConfigs = [
    {
      id: 'dark',
      name: 'Dark',
      description: 'Night',
      background: 'bg-zinc-900',
      windowBg: 'bg-zinc-800',
      headerBg: 'bg-zinc-700',
      headerBorder: 'border-zinc-600',
      tabColors: ['bg-zinc-600', 'bg-zinc-500', 'bg-zinc-600'],
      profileColor: 'bg-zinc-500',
      fadeColor: 'from-zinc-900',
      icon: <IconMoonStarsFill className="w-2.5 h-2.5 fill-blue-500" />
    },
    {
      id: 'light',
      name: 'Light',
      description: 'Bright',
      background: 'bg-white',
      windowBg: 'bg-gray-50',
      headerBg: 'bg-gray-100',
      headerBorder: 'border-gray-200',
      tabColors: ['bg-gray-300', 'bg-gray-400', 'bg-gray-300'],
      profileColor: 'bg-gray-400',
      fadeColor: 'from-white',
      icon: <IconSunMaxFill className="w-2.5 h-2.5 fill-amber-500" />
    },
    {
      id: 'system',
      name: 'System',
      description: 'Auto',
      background: 'bg-gradient-to-br from-slate-50 to-slate-200',
      windowBg: 'bg-slate-100',
      headerBg: 'bg-slate-200',
      headerBorder: 'border-slate-300',
      tabColors: ['bg-slate-300', 'bg-slate-400', 'bg-slate-300'],
      profileColor: 'bg-slate-400',
      fadeColor: 'from-slate-200',
      icon: <span className="text-slate-700 text-[6px] font-mono font-semibold">SYS</span>
    }
  ];

  // Theme preview component
  function ThemePreview({ config }: { config: typeof themeConfigs[0] }) {
    return (
      <div 
        className={cn(
          "relative cursor-pointer rounded-xl p-3 h-32 transition-all duration-200 group overflow-hidden",
          config.background,
          selectedTheme === config.id 
            ? "ring-4 ring-offset-4 ring-primary/20 ring-offset-background" 
            : "hover:ring-4 hover:ring-primary/10 ring-offset-background ring-offset-4"
        )}
        onClick={() => handleThemeChange(config.id)}
      >
        {/* Browser window representation */}
        <div className="absolute inset-2 top-4 left-24">
          {/* Browser window frame */}
          <div className={cn("w-full h-full rounded-sm overflow-hidden relative", config.windowBg)}>
            {/* Browser header */}
            <div className={cn("h-2 border-b flex items-center px-1 gap-0.5", config.headerBg, config.headerBorder)}>
              <div className="w-0.5 h-0.5 bg-red-400 rounded-full"></div>
              <div className="w-0.5 h-0.5 bg-yellow-400 rounded-full"></div>
              <div className="w-0.5 h-0.5 bg-green-400 rounded-full"></div>
            </div>
            {/* Content area with colored cards */}
            <div className="p-1.5 h-full">
              {/* Top bar with tabs and profile */}
              <div className="flex justify-between items-center mb-1">
                {/* Tabs block */}
                <div className="flex gap-1">
                  <div className={cn("w-3 h-1 rounded-sm", config.tabColors[0])}></div>
                  <div className={cn("w-3 h-1 rounded-sm", config.tabColors[1])}></div>
                  <div className={cn("w-3 h-1 rounded-sm", config.tabColors[2])}></div>
                </div>
                {/* Profile circle */}
                <div className={cn("w-2 h-2 rounded-full", config.profileColor)}></div>
              </div>
              <div className="grid grid-cols-4 gap-1 h-1/2">
                {['bg-blue-400', 'bg-green-400', 'bg-purple-400', 'bg-orange-400', 'bg-red-400', 'bg-yellow-400', 'bg-cyan-400', 'bg-pink-400'].map((color, index) => (
                  <div key={index} className={cn("rounded-sm flex items-start justify-start p-1", color)}>
                    <div className="w-1 h-1 bg-white/20 rounded-full"></div>
                  </div>
                ))}
              </div>
            </div>
            {/* Fade overlay */}
            <div className={cn("absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t to-transparent pointer-events-none", config.fadeColor)}></div>
          </div>
          {/* Theme icon overlay */}
          <div className="absolute bottom-1 right-1">
            <div className="w-6 h-6 bg-white rounded-lg border-[1px] border-black/5 shadow-sm flex items-center justify-center">
              {config.icon}
            </div>
          </div>
        </div>
        
        {/* Text in top-left */}
        <div className="absolute top-2 left-2 text-left z-10">
          <div className={cn("text-xs font-medium", config.id === 'dark' ? 'text-white' : config.id === 'system' ? 'text-slate-900' : 'text-zinc-900')}>
            {config.name}
          </div>
          <div className={cn("text-[10px]", config.id === 'dark' ? 'text-zinc-400' : config.id === 'system' ? 'text-slate-700' : 'text-zinc-600')}>
            {config.description}
          </div>
        </div>
      </div>
    );
  }

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

            {/* Theme Grid */}
            <div className="grid grid-cols-3 gap-6">
              {themeConfigs.map((config) => (
                <ThemePreview key={config.id} config={config} />
              ))}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 