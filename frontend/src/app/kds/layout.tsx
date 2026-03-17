export default function KDSLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-950 min-h-screen text-white">
      {children}
    </div>
  );
}
