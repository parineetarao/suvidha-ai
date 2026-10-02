"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { adminApi, setAdminToken } from "@/lib/admin-api"
import {
  AuthCard, CodeField, ErrorText, Field, Notice, PrimaryButton, Segmented, TextButton,
  contactLabel, errorMessage, parseContact,
} from "@/components/auth-ui"

type Role = "citizen" | "admin"

export default function LoginPage() {
  const [role, setRole] = useState<Role>("citizen")

  // /login?as=admin opens straight on the admin form.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("as") === "admin") setRole("admin")
  }, [])

  return (
    <AuthCard title="Log in" subtitle="Choose how you use SuvidhaAI.">
      <Segmented
        label="Account type"
        value={role}
        onChange={setRole}
        options={[
          { value: "citizen", label: "Citizen" },
          { value: "admin", label: "Admin" },
        ]}
      />
      {role === "citizen" ? <CitizenLogin /> : <AdminLogin />}
    </AuthCard>
  )
}

function CitizenLogin() {
  const router = useRouter()
  const { requestOtp, verifyOtp } = useAuth()

  const [step, setStep] = useState<"contact" | "code">("contact")
  const [contactInput, setContactInput] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const contact = parseContact(contactInput)

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!contact) {
      setError("Enter a valid email address or 10-digit mobile number.")
      return
    }
    setError(null)
    setLoading(true)
    try {
      await requestOtp({ ...contact, mode: "login" })
      setCode("")
      setStep("code")
    } catch (err) {
      setError(errorMessage(err, "Something went wrong. Try again."))
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!contact) return
    setError(null)
    setLoading(true)
    try {
      await verifyOtp({ ...contact, code })
      router.push("/")
    } catch (err) {
      setError(errorMessage(err, "Invalid code. Try again."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Segmented
        label="New or existing citizen"
        value="existing"
        onChange={(v) => v === "new" && router.push("/register")}
        options={[
          { value: "existing", label: "I have an account" },
          { value: "new", label: "I'm new" },
        ]}
      />

      {step === "contact" && (
        <form onSubmit={handleRequestOtp} className="space-y-4">
          <Field
            id="contact"
            label="Email or mobile number"
            hint="We'll send a 6-digit code — citizens don't need a password."
            type="text"
            autoComplete="username"
            required
            value={contactInput}
            onChange={(e) => setContactInput(e.target.value)}
            placeholder="you@example.com or 98765 43210"
          />
          <ErrorText error={error} />
          <PrimaryButton loading={loading} loadingText="Sending...">Send code</PrimaryButton>
        </form>
      )}

      {step === "code" && contact && (
        <form onSubmit={handleVerify} className="space-y-4">
          <p className="text-[13px] text-[#57534E]">We sent a 6-digit code to {contactLabel(contact)}.</p>
          <CodeField value={code} onChange={setCode} />
          <ErrorText error={error} />
          <PrimaryButton loading={loading} loadingText="Verifying...">Log in</PrimaryButton>
          <TextButton onClick={() => { setStep("contact"); setError(null) }}>Use a different email or mobile</TextButton>
        </form>
      )}

      <p className="mt-6 text-center text-[12px] text-[#57534E]">
        Can&apos;t receive the code?{" "}
        <Link href="/recover" className="text-[#1A6B3C] font-medium underline">Recover your account</Link>
      </p>
    </>
  )
}

function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { access_token } = await adminApi.login(email.trim(), password)
      setAdminToken(access_token)
      router.push("/admin")
    } catch (err) {
      setError(errorMessage(err, "Could not log in. Try again."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          id="admin-email"
          label="Admin email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
        />
        <div>
          <Field
            id="admin-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="mt-1 text-right">
            <Link href="/admin/forgot-password" className="text-[12px] text-[#1A6B3C] underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <ErrorText error={error} />
        <PrimaryButton loading={loading} loadingText="Logging in...">Log in as admin</PrimaryButton>
      </form>
      <div className="mt-5">
        <Notice>
          New admin? There is no public admin sign-up. A super admin creates your account from the admin
          dashboard and shares your first password; change it after you log in.
        </Notice>
      </div>
    </>
  )
}
