import { ReactNode } from 'react';
import Header from './Header';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-bl from-bg via-bg-elevated to-bg-surface relative overflow-hidden">
      {/* Subtle animated background effect - unique pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.04),transparent_50%)]"></div>
      <div className="absolute -top-20 right-1/4 w-[28rem] h-[28rem] bg-primary/4 rounded-full blur-3xl"></div>
      <div className="absolute top-1/3 -left-20 w-80 h-80 bg-primary/6 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 right-1/3 w-96 h-96 bg-primary/3 rounded-full blur-3xl"></div>
      <div className="absolute bottom-1/4 left-1/2 w-[30rem] h-[30rem] bg-primary/2 rounded-full blur-3xl"></div>

      <div className="relative z-10">
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header />
        </div>
        <main className="container mx-auto px-3 sm:px-4 lg:px-6 pt-20 sm:pt-24 pb-4 sm:pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}
