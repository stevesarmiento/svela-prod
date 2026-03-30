import type React from 'react'
import type { LucideIcon } from 'lucide-react'

interface SectionHeaderProps {
  title: string
  icon?: LucideIcon | React.ComponentType<{ className?: string }>
  className?: string
}

export function SectionHeader({ title, icon: Icon, className }: SectionHeaderProps) {
  return (
    <div className={`relative flex items-center justify-center py-4 ${className || ''}`}>
      {/* Background separator line */}
      <div className="absolute inset-0 flex items-center">
        <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
      </div>
      
      {/* Header content */}
      <div className="relative flex items-center gap-3 bg-background px-2 rounded-full">        
        <span className="text-xs text-white font-berkeley-mono flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 fill-foreground/30" />}
          {title}
        </span>
      </div>
    </div>
  )
}