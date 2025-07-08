# Settings Page Documentation

The settings page provides comprehensive user control over memory, privacy, appearance, and account preferences.

## Features Implemented

### 🧠 Memory & AI Settings

- **Memory Toggle**: Enable/disable AI memory functionality
- **Memory Statistics**: Live stats showing:
  - Total memories stored
  - Memories created in the last week
  - Storage space used
  - Age of oldest memory
- **Retention Settings**: Auto-delete policies (7 days, 30 days, 90 days, 1 year, never)
- **Memory Management**:
  - Clear memories older than X days
  - Export all memories as JSON
  - Clear all memories (with confirmation)

### 🔒 Privacy & Security

- **Analytics Collection**: Toggle anonymous usage data sharing
- **Data Sharing**: Control third-party integration permissions
- **Data Export**: Download all user data in JSON format

### 🎨 Appearance

- **Theme Selection**: Light, Dark, System
- **Chart Style**: Modern, Classic, Minimal

### 🔔 Notifications

- **Price Alerts**: Enable/disable price target notifications
- **Market Updates**: Daily market summaries
- **Feature Updates**: Product announcements

### 👤 Account Information

- **User Details**: Email, member since date
- **Subscription Status**: Current plan (Free/Pro)
- **Upgrade Options**: Link to Pro features

## API Endpoints

### Memory Management

- `GET /api/memory/stats?userId={id}` - Fetch memory statistics
- `POST /api/memory/cleanup` - Clean up old memories
- `POST /api/memory/export` - Export memories as JSON

### Usage Examples

```javascript
// Fetch memory stats
const response = await fetch(`/api/memory/stats?userId=${userId}`);
const { stats } = await response.json();

// Clear old memories
await fetch('/api/memory/cleanup', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'user-123',
    action: 'cleanup_old',
    days: 30
  })
});

// Export memories
const response = await fetch('/api/memory/export', {
  method: 'POST',
  body: JSON.stringify({ userId: 'user-123' })
});
const blob = await response.blob();
// Create download...
```

## Data Storage

### Local Storage (Client-Side)

```javascript
// Preferences saved locally
localStorage.setItem('memoryEnabled', 'true');
localStorage.setItem('retentionDays', '30');
```

### Memory Stats Structure

```typescript
interface MemoryStats {
  totalMemories: number;
  lastWeek: number;
  storageUsed: string;
  oldestMemory: string;
  memoryBreakdown?: {
    queries: number;
    responses: number;
    system: number;
  };
  recentActivity?: Array<{
    date: string;
    count: number;
  }>;
}
```

## User Experience Features

### 🔄 Real-time Updates

- Memory stats refresh after cleanup operations
- Loading states for all async operations
- Toast notifications for user feedback

### 📱 Responsive Design

- Mobile-first approach
- Card-based layout for easy scanning
- Proper spacing and typography

### 🛡️ Error Handling

- Graceful fallbacks for missing data
- Clear error messages
- Retry mechanisms for failed operations

## Integration with Memory System

The settings page directly integrates with the Cap.X memory service:

1. **Live Statistics**: Fetches real usage data
2. **Memory Control**: Actually affects chat memory behavior
3. **Data Export**: Retrieves actual stored memories
4. **Cleanup Operations**: Uses real Cap.X API calls

## Future Enhancements

### Planned Features

- **Memory Insights**: Visual charts of memory usage over time
- **Smart Retention**: AI-suggested retention periods based on usage
- **Memory Categories**: Organize memories by type (queries, responses, system)
- **Shared Memories**: Family/team memory sharing options
- **Memory Search**: Search through stored memories
- **Privacy Controls**: Granular control over what gets remembered

### Technical Improvements

- **Real-time Stats**: WebSocket connections for live updates
- **Batch Operations**: Bulk memory management
- **Database Storage**: Move preferences from localStorage to database
- **Advanced Export**: Multiple export formats (CSV, XML)
- **Memory Compression**: Optimize storage space
- **Automated Cleanup**: Scheduled cleanup jobs

## Security Considerations

- All memory operations require user authentication
- Memory data is tied to specific user IDs
- Export functionality includes proper file naming and security headers
- Cleanup operations include confirmation dialogs for destructive actions
- API endpoints validate user permissions

## Performance Notes

- Memory stats use caching to avoid excessive API calls
- Cleanup operations are throttled to prevent abuse
- Export functionality handles large datasets efficiently
- Loading states prevent UI freezing during operations

This settings page provides users with complete control over their memory experience while maintaining security and performance standards. 