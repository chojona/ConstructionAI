import { legalVersion, loginRecordFallback } from "@/lib/legal/copy";
import type { LegalFacts } from "@/lib/legal/facts";
import { FactEmail, FactText } from "@/components/legal/fact";

export function PrivacyNote({ facts }: { facts: LegalFacts }) {
  return (
    <article className="legal-doc" data-legal="privacy">
      <p className="eyebrow">Legal</p>
      <h1>Privacy and data deletion note</h1>
      <p className="legal-version">Version {legalVersion} · Effective date <FactText id="effectiveDate" facts={facts} />.</p>

      <section>
        <h2>1.1 Who we are</h2>
        <p>ConstructionAI is operated by <FactText id="legalEntityName" facts={facts} />, <FactText id="postalAddress" facts={facts} />. Questions about this note: <FactEmail id="privacyContactEmail" facts={facts} />.</p>
        <p>ConstructionAI is a business tool for construction contractors. This note covers our website, the pilot waitlist, and the ConstructionAI app.</p>
      </section>

      <section>
        <h2>1.2 What we collect on the waitlist</h2>
        <p>When you join the pilot waitlist, we ask for:</p>
        <ul>
          <li>your work email</li>
          <li>your company name</li>
          <li>your role</li>
          <li>whether your company bids DOT or heavy civil work</li>
          <li>the date and time you agreed, and the version of the Terms and Privacy Policy you agreed to (one version number covers both documents)</li>
          <li>which page and offer card you signed up from</li>
        </ul>
        <p>After you sign up, you can answer up to six optional questions about your work. You can skip them.</p>
        <p>We don&apos;t ask for a phone number on the waitlist, and we don&apos;t accept file uploads there.</p>
      </section>

      <section>
        <h2>1.3 What we collect in the app</h2>
        <p>When your company uses the app, we store:</p>
        <ul>
          <li><strong>Account details:</strong> your email, your name if you give it, a hash of your password (not the password itself), your access level in the app (admin, reviewer, contributor, or viewer), and whether your invite is pending, active, or disabled. While your invite is pending, we also keep a hash of your invite link, which expires after 14 days.</li>
          <li><strong>Sign-in records:</strong> a session record so you stay signed in. The cookie holds a token and our database keeps only a hash of it. A session lasts 14 days from sign-in; after that you sign in again.</li>
          <li><strong>Failed sign-in attempts:</strong> the email entered and the IP address, for failed sign-ins and failed attempts to use an invite link, so we can slow down repeated failed attempts. {loginRecordFallback}</li>
          <li><strong>Files you upload:</strong> PDF files (for example plan sets and specs), Bluebeam markup summaries as PDF or CSV files, the original file name, the document title and revision label you enter, and the text we read from each PDF page. Each PDF can be up to 4,400,000 bytes (about 4.4 MB) and 500 pages.</li>
          <li><strong>Bluebeam markup summaries:</strong> CSV markup summaries you upload can include reviewers&apos; names or logins and the text of their comments.</li>
          <li><strong>Your review work:</strong> the items the app suggests from your documents, and the accept, dismiss, or flag decisions your team makes on them, with who made each decision, when, and any reason or note added to it.</li>
          <li><strong>Packs and email drafts:</strong> approved packs your team exports, files attached to them, and email drafts your team writes in the app, including recipient addresses. The app records these drafts but does not send email.</li>
        </ul>
      </section>

      <section>
        <h2>1.4 Where your data is kept</h2>
        <p>The app runs on Vercel. Account and project records are kept in a Neon PostgreSQL database. Uploaded files and exported packs are kept with an S3-compatible object storage provider. <FactText id="storageProviderDetail" facts={facts} /></p>
        <p>Service providers that handle data for us: Vercel (hosting), Neon (database), and <FactText id="storageProvider" facts={facts} />.</p>
      </section>

      <section>
        <h2>1.5 How we use it</h2>
        <ul>
          <li>Waitlist details: to contact you about the waitlist and pilot, to learn about your work from any optional answers, and to send product updates if you ask for them.</li>
          <li>App data: to run the app for your company, keep your account working, and limit repeated failed sign-ins.</li>
        </ul>
        <p>We don&apos;t sell your data. We don&apos;t use third-party advertising or analytics tools on the site or in the app.</p>
        <p>We don&apos;t use your uploaded files or your review work to train AI models.</p>
      </section>

      <section>
        <h2>1.6 Cookies and browser storage</h2>
        <p>We use one cookie to keep you signed in. The app also saves two things in your browser&apos;s local storage: whether you collapsed the sidebar, and the reviewer name you type on the review screen. We don&apos;t use advertising or tracking cookies. Fonts load from our own site, with no request to Google.</p>
      </section>

      <section>
        <h2>1.7 Deleting your data</h2>
        <p><strong>App accounts.</strong> An admin at your company can disable a person&apos;s access. Disabling stops sign-in. It doesn&apos;t erase that person&apos;s records, because their review decisions stay part of the project record.</p>
        <p><strong>Uploaded files and project records.</strong> The app keeps project records, including uploaded files, as a fixed history, so a pack can always be traced to its source. ConstructionAI doesn&apos;t have a delete option yet. To ask us to remove a file, or to erase your company&apos;s data (for example when your company leaves the pilot), email <FactEmail id="privacyContactEmail" facts={facts} />.</p>
      </section>

      <section>
        <h2>1.8 Changes to this note</h2>
        <p>If we change this note, we&apos;ll post the new version here with a new effective date. If the change is significant, we&apos;ll also tell signed-up users by email before it applies.</p>
      </section>
    </article>
  );
}
