import type { Coin, CoinDetail } from '@/types/coins';
  
  export async function searchCoins(query: string): Promise<Coin[]> {
    try {
      const response = await fetch(`/api/coinmarketcap?query=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to search coins');
      }
      
      const data = await response.json();
      return data.coins || [];
    } catch (error) {
      console.error('Search coins error:', error);
      throw error;
    }
  }
  
  export async function getCoinData(id: string): Promise<CoinDetail> {
    try {
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_API_URL || process.env.VERCEL_URL || 'http://localhost:3000';
        
      const response = await fetch(`${baseUrl}/api/coins/${encodeURIComponent(id)}`);

      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const data = await response.json();
      
      console.log('getCoinData Response:', {
        hasHistorical: !!data.historical,
        quotesLength: data.historical?.quotes?.length,
        historicalData: data.historical
      });
  
      if (!data.historical?.quotes) {
        console.warn('Missing historical data in response');
      }
  
      return data;
    } catch (error) {
      console.error('Get coin data error:', error);
      throw error;
    }
  }

  export async function getTopCoins(): Promise<Coin[]> {
    try {
      const response = await fetch('/api/coinmarketcap/top');
      if (!response.ok) throw new Error('Failed to fetch top coins');
      const data = await response.json();
      return data.coins || [];
    } catch (error) {
      console.error('Get top coins error:', error);
      throw error;
    }
  }