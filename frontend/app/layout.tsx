import type { Metadata } from 'next'
import { Libre_Baskerville, Mukta } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const libreBaskerville = Libre_Baskerville({
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-libre-baskerville',
})

const mukta = Mukta({
  weight: ['400', '600', '700', '800'],
  subsets: ['latin'],
  variable: '--font-mukta',
})

export const metadata: Metadata = {
  title: 'SuvidhaAI - Government Scheme Finder',
  description: 'SuvidhaAI guides you through every step from not knowing what you qualify for to walking into a CSC fully prepared. Accurate, Free, In your language.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${libreBaskerville.variable} ${mukta.variable}`}>
      <body className="font-mukta antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
