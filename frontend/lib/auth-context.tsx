"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { apiPost, setAccessToken, ApiError } from "./api-client"

interface User {
  id: string
  mobile_number: string | null
  email: string | null
  full_name: string | null
  date_of_birth: string | null
  is_verified: boolean
  created_at: string
}

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  requestOtp: (params: { email?: string; mobile_number?: string; mode?: "login" | "register" }) => Promise<void>
  verifyOtp: (params: {
    email?: string
    mobile_number?: string
    code: string
    full_name?: string
  }) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const STORAGE_KEY = "suvidha_user"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setUser(JSON.parse(stored))
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    setIsLoading(false)
  }, [])

  const requestOtp = useCallback(
    async (params: { email?: string; mobile_number?: string; mode?: "login" | "register" }) => {
      await apiPost("/auth/request-otp", params)
    },
    []
  )

  const verifyOtp = useCallback(
    async (params: { email?: string; mobile_number?: string; code: string; full_name?: string }) => {
      const response = await apiPost<{ access_token: string; token_type: string; user: User }>(
        "/auth/verify-otp",
        params
      )
      setAccessToken(response.access_token)
      setUser(response.user)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(response.user))
    },
    []
  )

  const logout = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
    apiPost("/auth/logout").catch(() => {})
  }, [])

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, requestOtp, verifyOtp, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

export { ApiError }