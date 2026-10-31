import { Link, useRouterState } from "@tanstack/react-router";
import { Mic, Network, Home, User, CalendarDays } from "lucide-react";

const items = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/scheduling", label: "Plan", icon: CalendarDays },
  { to: "/capture", label: "Capture", icon: Mic },
  { to: "/maps", label: "Maps", icon: Network },
  { to: "/profile", label: "You", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="notiox-bottom-nav" aria-label="Main navigation">
      <div className="notiox-bottom-nav-inner">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={`notiox-nav-link ${to === "/capture" ? "notiox-nav-capture" : ""} ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="notiox-nav-icon"><Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} /></span>
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
