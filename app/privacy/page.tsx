import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { contactEmail } from "@/lib/contact";

export const metadata: Metadata = { title: "Privacy policy" };

const UPDATED = "October 17, 2026";

export default function PrivacyPage() {
  const email = contactEmail();
  const contact = email ? <a href={`mailto:${email}`}>{email}</a> : "the address your JobWatch alerts come from";
  return (
    <article className="wrap legal">
      <span className="eyebrow">Last updated {UPDATED}</span>
      <h1>Privacy policy</h1>
      <p className="lede">
        {APP_NAME} is a free job-alert and application-tracking tool. We collect only what it needs to work, keep your files private, and never
        sell your data or show ads.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><b>Your account:</b> your email address and, if you sign in with Google, your name. Passwords are handled by our sign-in provider and stored only as secure hashes.</li>
        <li><b>Your alerts:</b> the roles, places, filters, delivery hours and channels you choose.</li>
        <li><b>Your job log:</b> jobs we find or you add, their stage, dates, notes and job descriptions.</li>
        <li><b>Your documents:</b> resumes and cover letters you upload or create. They sit in a private folder that only your account can open.</li>
        <li><b>Connected channels:</b> your Telegram chat ID if you connect Telegram, and your Discord webhook link if you add one.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To search public job sites for roles that match your alerts and send them to you, only during the hours you pick.</li>
        <li>To show your dashboard, job log, pay information and Application kit drafts.</li>
        <li>To send account emails such as sign-up confirmation and password resets.</li>
      </ul>
      <p>
        Your resume is read on our servers only to build your drafts and skills match; it is not shared with anyone. The interview-practice
        prompt leaves {APP_NAME} only if you copy it into an AI chat yourself.
      </p>

      <h2>Google sign-in</h2>
      <p>
        If you continue with Google, we receive only your basic profile (name, email address and profile picture) to create and sign in to your
        account. We do not request access to your Gmail, Drive, Calendar or contacts, and we use Google user data only to provide sign-in.
      </p>

      <h2>Services that help run {APP_NAME}</h2>
      <ul>
        <li><b>Supabase</b> (Canada region): database, sign-in and private file storage.</li>
        <li><b>Vercel</b>: hosts the website.</li>
        <li><b>GitHub Actions</b>: runs the scheduled job search. Its logs contain counts only, never your details.</li>
        <li><b>Gmail</b>: sends alert and account emails.</li>
        <li><b>Telegram and Discord</b>: deliver alerts only if you connect them.</li>
        <li>
          <b>Public sources, without your personal details:</b> LinkedIn and Indeed job searches use only the role and place from your alerts.
          The email finder sends a company name to Clearbit&apos;s public company lookup and checks the domain with Google Public DNS. Reading
          a job posting may send that posting&apos;s link to Jina Reader.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>We use only the cookies needed to keep you signed in. No advertising or tracking cookies.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Edit or delete alerts, jobs and documents at any time in the app.</li>
        <li><b>Download your data</b> as a file, or <b>delete some or all of it, or your whole account</b>, instantly in <Link href="/settings#data">Settings → Your data</Link>.</li>
        <li>Disconnect Telegram or Discord in <Link href="/settings">Settings</Link>, or send /stop to the bot.</li>
        <li>If you can&apos;t sign in, email {contact} to have your account deleted or to ask what we hold about you. We act on requests within 30 days.</li>
      </ul>

      <h2>Keeping data</h2>
      <p>We keep your data while your account exists. When you delete your account, your data and files are removed from our systems right away.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we&apos;ll update the date above. Questions: {contact}.</p>
    </article>
  );
}
