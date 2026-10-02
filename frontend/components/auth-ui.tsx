"use client"

// Small shared building blocks for the login / register / recovery / admin
// auth pages, so they all look like the original login card.

import Link from "next/link"
import type { ReactNode } from "react"

export function AuthCard({ title, subtitle, children, wide = false }: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center px-4 py-16">
      <div className={`w-full ${wide ? "max-w-md" : "max-w-sm"} bg-white border border-[#E7E0D8] rounded-[8px] p-6 sm:p-8`}>
        <Link href="/" className="text-[12px] text-[#57534E] hover:text-[#1A6B3C]">← SuvidhaAI home</Link>
        <h1 className="text-[22px] font-semibold text-[#1A1A1A] mt-3 mb-1">{title}</h1>
        {subtitle && <div className="text-[13px] text-[#57534E] mb-5 leading-[1.5]">{subtitle}</div>}
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="grid grid-flow-col auto-cols-fr gap-1 bg-[#F5F0E8] rounded-[6px] p-1 mb-4">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`text-[13px] rounded-[4px] py-1.5 transition-colors ${
            value === o.value ? "bg-white text-[#1A1A1A] font-medium shadow-sm" : "text-[#57534E] hover:text-[#1A1A1A]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ id, label, hint, ...input }: {
  id: string
  label: string
  hint?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-[#57534E]">{label}</label>
      <input
        id={id}
        {...input}
        className={`w-full bg-[#FAF7F2] border border-[#E7E0D8] rounded-[5px] px-3 py-2 text-[14px] text-[#1A1A1A] outline-none focus:border-[#1A6B3C] ${input.className ?? ""}`}
      />
      {hint && <p className="mt-1 text-[11px] text-[#78716C]">{hint}</p>}
    </div>
  )
}

export function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field
      id="code"
      label="6-digit code"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      required
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      className="tracking-[0.3em] text-center"
      placeholder="000000"
    />
  )
}

export function PrimaryButton({ loading, children, loadingText }: {
  loading: boolean
  children: ReactNode
  loadingText: string
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-[#1A6B3C] text-white text-[13px] rounded-[5px] px-4 py-2.5 hover:bg-[#155032] transition-colors disabled:opacity-50"
    >
      {loading ? loadingText : children}
    </button>
  )
}

export function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-[12px] text-[#57534E] underline">
      {children}
    </button>
  )
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null
  return <p role="alert" className="text-[12px] text-red-600">{error}</p>
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" }) {
  const styles = tone === "success"
    ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]"
    : "bg-[#F0F9FF] border-[#BAE6FD] text-[#075985]"
  return <div className={`border rounded-[6px] px-3 py-2 text-[12px] leading-[1.5] ${styles}`}>{children}</div>
}

/** Accepts an email or a 10-digit Indian mobile (optionally +91 / spaces). */
export function parseContact(raw: string): { email: string } | { mobile_number: string } | null {
  const value = raw.trim()
  let digits = value.replace(/[\s-]/g, "")
  if (digits.startsWith("+91")) digits = digits.slice(3)
  if (/^[6-9]\d{9}$/.test(digits)) return { mobile_number: digits }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return { email: value.toLowerCase() }
  return null
}

export function contactLabel(contact: { email: string } | { mobile_number: string }): string {
  return "email" in contact ? contact.email : `+91 ${contact.mobile_number}`
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "detail" in err) {
    const detail = (err as { detail: unknown }).detail
    if (typeof detail === "string") return detail
    // FastAPI validation errors: [{ msg: "..." }]
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, "")
  }
  return fallback
}
