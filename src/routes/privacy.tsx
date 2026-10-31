import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias → canonical /privacy-policy (store listings + footer). */
export const Route = createFileRoute("/privacy")({
  beforeLoad: () => {
    throw redirect({ to: "/privacy-policy" });
  },
  component: () => null,
});
