"use client"

import Link from "next/link"
import { useAuth } from "@/lib/auth-context"

export default function AuthStatus() {
  const { user, isAuthenticated, logout } = useAuth()

  if (!isAuthenticated) {
    return (
      <Link
        href="/login"
        className="bg-[#1A6B3C] text-white text-[12px] rounded-[5px] px-3 sm:px-[18px] py-2 hover:bg-[#155032] transition-colors whitespace-nowrap"
      >
        Login
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-[#57534E]">
        {user?.full_name || user?.email || user?.mobile_number}
      </span>
      <button
        onClick={logout}
        className="text-[12px] text-[#1A6B3C] underline"
      >
        Log out
      </button>
    </div>
  )
}