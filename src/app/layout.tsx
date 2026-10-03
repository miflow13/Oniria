import type {Metadata} from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Oniria — The Living DEV Library',
  description: 'Explore real DEV articles in a walkable 3D library powered by Sanity.',
}

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
