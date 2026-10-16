import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { isDemoEmail } from "@/lib/demo";
import { AppNav } from "@/components/AppNav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const demo = isDemoEmail(user.email);
  return (
    <>
      {demo && (
        <div className="demo-banner">
          <div className="wrap demo-banner-in">
            <span>👀 You&apos;re exploring the <b>live demo</b> with real Calgary jobs. It&apos;s read-only.</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn btn-sm btn-dark btn-pill">Create my own account</button>
            </form>
          </div>
        </div>
      )}
      <AppNav />
      <div className="wrap page">{children}</div>
    </>
  );
}
