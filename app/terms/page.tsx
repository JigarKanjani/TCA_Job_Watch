import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { contactEmail } from "@/lib/contact";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  const email = contactEmail();
  return (
    <article className="wrap legal">
      <span className="eyebrow">Last updated October 17, 2026</span>
      <h1>Terms of use</h1>
      <p className="lede">{APP_NAME} is free to use. By using it you agree to these simple terms.</p>

      <h2>The service</h2>
      <ul>
        <li>{APP_NAME} searches public job sites and helps you track applications. We don&apos;t employ anyone, post jobs or guarantee interviews.</li>
        <li>Job details come from third-party sites and may be incomplete, out of date or removed. Always check the original posting.</li>
        <li>Pay marked <b>Est.</b> is an estimate from public wage data, not an offer or a figure from the employer.</li>
        <li>Drafts from the Application kit are starting points. You are responsible for what you send.</li>
      </ul>

      <h2>Fair use</h2>
      <ul>
        <li>Use the email finder for genuine, individual outreach about jobs, not bulk or unsolicited marketing.</li>
        <li>Don&apos;t try to break, overload or misuse the service or other people&apos;s accounts.</li>
      </ul>

      <h2>No warranty</h2>
      <p>
        The service is provided as is, without guarantees of availability or accuracy. To the extent the law allows, we aren&apos;t liable for
        losses from using it. We may change or stop features at any time.
      </p>

      <h2>Your data</h2>
      <p>
        See the <Link href="/privacy">privacy policy</Link>.{email ? <> Questions: <a href={`mailto:${email}`}>{email}</a>.</> : null}
      </p>
    </article>
  );
}
