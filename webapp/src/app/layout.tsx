import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { NavigationBar } from '@/components/layout/navigation-bar';
import { Toaster } from '@/components/ui/sonner';
import {
  resolvePublicPocketbaseUrl,
  runtimeConfigScript,
} from '@/lib/runtime-config';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Next.js + PocketBase Template',
  description: 'A modern full-stack template with authentication',
};

// The runtime config below is read from `process.env` per request. Without
// this the layout is prerendered during `next build` and the emitted script
// would carry the *build*-time value — the bug this exists to fix. The cost is
// the app's static prerendering: every route becomes server-rendered on
// demand. Cheap here, because every page is already `'use client'` and renders
// no request-independent content worth caching.
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pocketbaseUrl = resolvePublicPocketbaseUrl(process.env);

  return (
    <html lang="en">
      {/* Inline classic script setting the runtime config during HTML parse.
          React hoists Next's own bundle <script async> tags ABOVE anything the
          layout emits, so this is NOT the first child of <head> and cannot be
          made so from the App Router — an async chunk could execute first and
          construct the PocketBase singleton with the stale URL. `AuthProvider`
          closes that window by reconciling `pb.baseURL` before any consumer
          renders; see `syncBaseUrl` in lib/pocketbase.ts. Emitted only when
          configured, so deployments that set nothing ship byte-identical HTML
          to before. */}
      {pocketbaseUrl && (
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: runtimeConfigScript({ pocketbaseUrl }),
            }}
          />
        </head>
      )}
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <NavigationBar />
          <main className="min-h-screen">{children}</main>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
