export const BASE_URL = "https://pro-api.coinmarketcap.com/v1";
const API_KEY = process.env.COINMARKETCAP_API_KEY;

export async function fetchWithErrorHandling(url: string) {
    if (!API_KEY) {
      throw new Error('CoinMarketCap API key is not configured');
    }
  
    try {
      const response = await fetch(url, {
        headers: {
          'X-CMC_PRO_API_KEY': API_KEY,
          'Accept': 'application/json',
        },
        next: {
          revalidate: 60,
        },
      });
  
      const data = await response.json();
      console.log('Raw API Response:', data); // Log the raw response
  
      if (!response.ok) {
        throw new Error(data.status?.error_message || `API error: ${response.status}`);
      }
  
      return data;
    } catch (error) {
      console.error("CoinMarketCap API error:", error);
      throw error;
    }
  }