import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Das Elb POS — Waiter Tablet',
};

// Full-screen layout that bypasses AppShell navigation
export default function POSLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#060f0a] overflow-hidden flex flex-col">
      {children}
    </div>
  );
}
