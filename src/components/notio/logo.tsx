export function NotioLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-bold tracking-tight ${className}`}>
      <img
        src="/logo.png"
        alt="Notio"
        className="h-[1.4em] w-[1.4em] rounded-lg"
        width={512}
        height={512}
      />
      <span className="text-gradient">Notio</span>
    </span>
  );
}

