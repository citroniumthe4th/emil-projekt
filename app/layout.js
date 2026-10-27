import './globals.css'

export const metadata = { title: 'Group Chat Story' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
