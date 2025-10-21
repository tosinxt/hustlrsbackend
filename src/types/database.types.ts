// Generated types for Supabase

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          phone_number: string
          first_name: string
          last_name: string
          password_hash: string
          user_type: 'CUSTOMER' | 'HUSTLER' | 'BOTH'
          is_verified: boolean
          is_active: boolean
          avatar_url: string | null
          bio: string | null
          skills: string[] | null
          rating: number
          total_rating: number
          tasks_completed: number
          tasks_posted: number
          total_earnings: number
          response_time: number
          last_login_at: string | null
          last_activity_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          phone_number: string
          first_name: string
          last_name: string
          password_hash: string
          user_type?: 'CUSTOMER' | 'HUSTLER' | 'BOTH'
          is_verified?: boolean
          is_active?: boolean
          avatar_url?: string | null
          bio?: string | null
          skills?: string[] | null
          rating?: number
          total_rating?: number
          tasks_completed?: number
          tasks_posted?: number
          total_earnings?: number
          response_time?: number
          last_login_at?: string | null
          last_activity_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          phone_number?: string
          first_name?: string
          last_name?: string
          password_hash?: string
          user_type?: 'CUSTOMER' | 'HUSTLER' | 'BOTH'
          is_verified?: boolean
          is_active?: boolean
          avatar_url?: string | null
          bio?: string | null
          skills?: string[] | null
          rating?: number
          total_rating?: number
          tasks_completed?: number
          tasks_posted?: number
          total_earnings?: number
          response_time?: number
          last_login_at?: string | null
          last_activity_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      // Add other tables as needed
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// User type for authentication
export type User = Database['public']['Tables']['users']['Row']
