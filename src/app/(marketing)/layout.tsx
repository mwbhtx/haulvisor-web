export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen text-foreground relative" style={{ backgroundColor: "#000000" }}>
      {children}
    </div>
  );
}
