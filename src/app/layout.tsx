import type {Metadata} from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Oniria — Dream Journal',
  description: 'A strange little dream journal built with Next.js and Sanity.',
}

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
