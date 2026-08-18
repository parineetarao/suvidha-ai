"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth, ApiError } from "@/lib/auth-context"

export default function LoginPage() {
  const router = useRouter()
  const { requestOtp, verifyOtp } = useAuth()

  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await requestOtp({ email, mode: "login"  })
      setStep("code")
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Something went wrong. Try again.")
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await verifyOtp({ email, code })
      router.push("/")
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Invalid code. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm bg-white border border-[#E7E0D8] rounded-[8px] p-8">
        <h1 className="text-[22px] font-semibold text-[#1A1A1A] mb-1">Log in</h1>
        <p className="text-[13px] text-[#57534E] mb-6">
          {step === "email"
            ? "Enter your email to receive a verification code."
            : `We sent a 6-digit code to ${email}.`}
        </p>

        {step === "email" && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-[12px] font-medium text-[#57534E]">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#FAF7F2] border border-[#E7E0D8] rounded-[5px] px-3 py-2 text-[14px] text-[#1A1A1A] outline-none focus:border-[#1A6B3C]"
                placeholder="you@example.com"
              />
            </div>
            {error && <p className="text-[12px] text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1A6B3C] text-white text-[13px] rounded-[5px] px-4 py-2.5 hover:bg-[#155032] transition-colors disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send code"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label htmlFor="code" className="mb-1 block text-[12px] font-medium text-[#57534E]">
                Verification code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-[#FAF7F2] border border-[#E7E0D8] rounded-[5px] px-3 py-2 text-[14px] text-[#1A1A1A] tracking-[0.3em] text-center outline-none focus:border-[#1A6B3C]"
                placeholder="000000"
              />
            </div>
            {error && <p className="text-[12px] text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1A6B3C] text-white text-[13px] rounded-[5px] px-4 py-2.5 hover:bg-[#155032] transition-colors disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Log in"}
            </button>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="w-full text-[12px] text-[#57534E] underline"
            >
              Use a different email
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[12px] text-[#57534E]">
          New here?{" "}
          <Link href="/register" className="text-[#1A6B3C] font-medium underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}