"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth, type User } from "@/lib/auth-context"
import { apiPost, ApiError } from "@/lib/api-client"
import {
  AuthCard, CodeField, ErrorText, Field, Notice, PrimaryButton, TextButton, errorMessage, parseContact,
} from "@/components/auth-ui"

export default function AccountPage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const [welcome, setWelcome] = useState(false)

  useEffect(() => {
    setWelcome(new URLSearchParams(window.location.search).get("welcome") === "1")
  }, [])

  if (isLoading) return null
  if (!isAuthenticated || !user) {
    return (
      <AuthCard title="My account" subtitle="Log in to manage your account.">
        <Link href="/login" className="block text-center bg-[#1A6B3C] text-white text-[13px] rounded-[5px] px-4 py-2.5">
          Log in
        </Link>
      </AuthCard>
    )
  }

  const hasBoth = !!user.email && !!user.mobile_number

  return (
    <AuthCard title="My account" wide subtitle={user.full_name ? `Signed in as ${user.full_name}` : undefined}>
      {welcome && !hasBoth && (
        <div className="mb-4">
          <Notice tone="success">Account created. Add a backup contact below so you can always get back in.</Notice>
        </div>
      )}

      <h2 className="text-[13px] font-semibold text-[#1A1A1A] mb-2">Ways to log in</h2>
      <dl className="border border-[#E7E0D8] rounded-[6px] divide-y divide-[#E7E0D8] text-[13px] mb-5">
        <div className="flex justify-between gap-3 px-3 py-2">
          <dt className="text-[#57534E]">Email</dt>
          <dd className="text-[#1A1A1A] truncate">{user.email ?? <span className="text-[#A8A29E]">not added</span>}</dd>
        </div>
        <div className="flex justify-between gap-3 px-3 py-2">
          <dt className="text-[#57534E]">Mobile</dt>
          <dd className="text-[#1A1A1A]">
            {user.mobile_number ? `+91 ${user.mobile_number}` : <span className="text-[#A8A29E]">not added</span>}
          </dd>
        </div>
      </dl>

      {hasBoth ? (
        <Notice tone="success">
          You can log in with either contact. If you lose access to one, use the other. If you lose both,{" "}
          <Link href="/recover" className="underline">request recovery</Link>.
        </Notice>
      ) : (
        <AddBackupContact user={user} />
      )}

      <button onClick={logout} className="mt-6 w-full text-[12px] text-[#57534E] underline">Log out</button>
    </AuthCard>
  )
}

function AddBackupContact({ user }: { user: User }) {
  const { updateUser } = useAuth()
  const wants = user.email ? "mobile" : "email"
  const [step, setStep] = useState<"contact" | "code">("contact")
  const [value, setValue] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const parsed = parseContact(value)
  const valid = parsed && (wants === "email" ? "email" in parsed : "mobile_number" in parsed)

  function handleError(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 401) {
      setError("Your session has expired — log out and log in again, then add the contact.")
    } else {
      setError(errorMessage(err, fallback))
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || !parsed) {
      setError(wants === "email" ? "Enter a valid email address." : "Enter a valid 10-digit mobile number.")
      return
    }
    setError(null)
    setLoading(true)
    try {
      await apiPost("/users/me/contacts/request-otp", parsed)
      setCode("")
      setStep("code")
    } catch (err) {
      handleError(err, "Could not send the code. Try again.")
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!parsed) return
    setError(null)
    setLoading(true)
    try {
      updateUser(await apiPost<User>("/users/me/contacts/verify", { ...parsed, code }))
    } catch (err) {
      handleError(err, "Invalid code. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-[#E7E0D8] rounded-[6px] p-4">
      <h2 className="text-[13px] font-semibold text-[#1A1A1A] mb-1">Add a backup {wants}</h2>
      <p className="text-[12px] text-[#57534E] mb-3">
        Your account is only reachable through the contact above. Add a {wants} too, so you can still log in if
        you lose that one.
      </p>
      {step === "contact" ? (
        <form onSubmit={handleSend} className="space-y-3">
          <Field
            id="backup"
            label={wants === "email" ? "Email address" : "Mobile number"}
            type={wants === "email" ? "email" : "tel"}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={wants === "email" ? "you@example.com" : "98765 43210"}
          />
          <ErrorText error={error} />
          <PrimaryButton loading={loading} loadingText="Sending...">Send code</PrimaryButton>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-3">
          <p className="text-[12px] text-[#57534E]">Enter the code we sent to {value}.</p>
          <CodeField value={code} onChange={setCode} />
          <ErrorText error={error} />
          <PrimaryButton loading={loading} loadingText="Verifying...">Add {wants}</PrimaryButton>
          <TextButton onClick={() => { setStep("contact"); setError(null) }}>Change {wants}</TextButton>
        </form>
      )}
    </div>
  )
}
