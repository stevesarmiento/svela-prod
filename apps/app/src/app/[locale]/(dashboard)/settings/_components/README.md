# Settings Components

This directory contains all the individual settings components that make up the settings page.

## Architecture

Each settings section is broken down into its own component for better organization and maintainability:

### Current Components

- **`memory-settings.tsx`** - Complete memory management functionality
  - Memory toggle on/off
  - Live memory statistics
  - Retention policies
  - Memory cleanup and export

### Adding New Components

To add a new settings section:

1. **Create the component file**:
   ```bash
   touch _components/appearance-settings.tsx
   ```

2. **Export from index**:
   ```typescript
   // _components/index.ts
   export { MemorySettings } from './memory-settings';
   export { AppearanceSettings } from './appearance-settings';
   ```

3. **Add to main page**:
   ```typescript
   // page.tsx
   import { MemorySettings, AppearanceSettings } from './_components';
   
   return (
     <div className="grid gap-6">
       <MemorySettings />
       <AppearanceSettings />
     </div>
   );
   ```

### Component Structure

Each settings component should follow this pattern:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@v1/ui/card';
// ... other imports

export function YourSettings() {
  // Local state management
  const [setting, setSetting] = useState(false);
  
  // Load saved preferences
  useEffect(() => {
    const saved = localStorage.getItem('yourSetting');
    if (saved !== null) {
      setSetting(saved === 'true');
    }
  }, []);

  // Handle changes
  const handleChange = async (value: boolean) => {
    setSetting(value);
    localStorage.setItem('yourSetting', value.toString());
    toast.success('Setting updated');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Settings</CardTitle>
        <CardDescription>Description of what this controls</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Your settings UI */}
      </CardContent>
    </Card>
  );
}
```

### Benefits of This Architecture

1. **Separation of Concerns** - Each component handles one area of settings
2. **Reusability** - Components can be reused in other parts of the app
3. **Maintainability** - Easy to find and update specific functionality
4. **Testing** - Each component can be tested in isolation
5. **Performance** - Only load the components you need

### Future Components

Planned settings components:

- **AppearanceSettings** - Theme, layout, chart styles
- **PrivacySettings** - Data sharing, analytics preferences  
- **NotificationSettings** - Email, push, price alerts
- **AccountSettings** - Profile, subscription, billing
- **IntegrationSettings** - API keys, third-party connections
- **SecuritySettings** - 2FA, session management 