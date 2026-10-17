import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { getUser } from "@/lib/supabase/server";
import { LogoMark } from "./LogoMark";

export async function SiteHeader() {
  const { user } = await getUser();
  return (
    <header className="bar">
      <div className="wrap bar-in">
        <Link href="/" className="brand">
          <LogoMark /> {APP_NAME}
        </Link>
        <div className="bar-right">
          {user ? (
            <>
              <Link className="btn btn-dark btn-sm btn-pill" href="/dashboard">
                My alerts
              </Link>
              <form action="/auth/signout" method="post">
                <button className="btn btn-ghost btn-sm" type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link className="btn btn-dark btn-sm btn-pill" href="/login">
              Get alerts
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
