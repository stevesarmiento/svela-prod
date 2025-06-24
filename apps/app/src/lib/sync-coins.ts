// Cron job or webhook to update coin index
export async function syncCoinsToConvex() {
    const response = await fetch('/api/coinmarketcap/map?limit=5000');
    const { coins } = await response.json();
    
    // Batch update Convex
    await fetch('/api/convex/sync-coins', {
      method: 'POST',
      body: JSON.stringify({ coins }),
    });
  }