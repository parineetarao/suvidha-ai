"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth, ApiError } from "@/lib/auth-context"

export default function RegisterPage() {
  const router = useRouter()
  const { requestOtp, verifyOtp } = useAuth()

  const [step, setStep] = useState<"details" | "code">("details")
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await requestOtp({ email, mode: "register" })
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
      await verifyOtp({ email, code, full_name: fullName })
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
        <h1 className="text-[22px] font-semibold text-[#1A1A1A] mb-1">Create an account</h1>
        <p className="text-[13px] text-[#57534E] mb-6">
          {step === "details"
            ? "Tell us a little about you to get started."
            : `We sent a 6-digit code to ${email}.`}
        </p>

        {step === "details" && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="mb-1 block text-[12px] font-medium text-[#57534E]">
                Full name
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-[#FAF7F2] border border-[#E7E0D8] rounded-[5px] px-3 py-2 text-[14px] text-[#1A1A1A] outline-none focus:border-[#1A6B3C]"
                placeholder="Your name"
              />
            </div>
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
              {loading ? "Verifying..." : "Create account"}
            </button>
            <button
              type="button"
              onClick={() => setStep("details")}
              className="w-full text-[12px] text-[#57534E] underline"
            >
              Edit details
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[12px] text-[#57534E]">
          Already have an account?{" "}
          <Link href="/login" className="text-[#1A6B3C] font-medium underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}