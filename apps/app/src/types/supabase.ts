export interface Database {
    public: {
      Tables: {
        watchlists: {
          Row: {
            id: string
            user_id: string
            coin_id: string
            created_at: string
          }
          Insert: {
            id?: string
            user_id: string
            coin_id: string
            created_at?: string
          }
          Update: {
            id?: string
            user_id?: string
            coin_id?: string
            created_at?: string
          }
        }
      }
    }
  }