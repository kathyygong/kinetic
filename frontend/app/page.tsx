import { redirect } from "next/navigation";

// Root route just lands on the dashboard. Auth-aware redirects (e.g.
// to /login when there's no signed-in user) live in the dashboard
// itself so the rule has access to the Firebase client SDK.
export default function Home() {
  redirect("/dashboard");
}

