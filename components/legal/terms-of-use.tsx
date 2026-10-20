import { legalVersion } from "@/lib/legal/copy";
import type { LegalFacts } from "@/lib/legal/facts";
import { FactEmail, FactText } from "@/components/legal/fact";

export function TermsOfUse({ facts }: { facts: LegalFacts }) {
  return (
    <article className="legal-doc" data-legal="terms">
      <p className="eyebrow">Legal</p>
      <h1>Pilot terms of use</h1>
      <p className="legal-version">Version {legalVersion} · Effective date <FactText id="effectiveDate" facts={facts} />.</p>

      <section>
        <h2>2.1 Who these terms are with</h2>
        <p>These terms are between <FactText id="legalEntityName" facts={facts} /> (&quot;we&quot;) and the company that uses ConstructionAI (&quot;you&quot; or &quot;your company&quot;). The person accepting them confirms they can accept on behalf of their company. If your company has signed a separate pilot agreement with us, that agreement wins where it conflicts with these terms.</p>
      </section>

      <section>
        <h2>2.2 What ConstructionAI does and doesn&apos;t do</h2>
        <p>In the pilot, ConstructionAI shows the current revision of each sheet with its source page, lets your team compare versions, mark them reviewed, and export a pack.</p>
        <p>ConstructionAI also reads the PDFs you upload and suggests items, such as dates, quantities, and equipment, each with the page it came from. Your team decides what to accept, dismiss, or flag.</p>
        <p>Suggestions can be wrong or incomplete. You review and approve every line before you use it in a pay request, change order, claim, notice, or any other submission. Your company is responsible for what it submits to an owner, agency, or anyone else.</p>
        <p>ConstructionAI does not give legal, claims, contract, or accounting advice.</p>
      </section>

      <section>
        <h2>2.3 Your files belong to you</h2>
        <p>You own the files and data you upload and the decisions your team records (&quot;Your Content&quot;). These terms don&apos;t transfer ownership of Your Content to us.</p>
      </section>

      <section>
        <h2>2.4 What we may do with Your Content</h2>
        <p>You let us store, copy, and process Your Content only to:</p>
        <ul>
          <li>run ConstructionAI for your company;</li>
          <li>fix problems you report and keep the service working;</li>
          <li>meet a legal requirement.</li>
        </ul>
        <p>Sample data in the app&apos;s demo projects is not Your Content.</p>
      </section>

      <section>
        <h2>2.5 Upload rules</h2>
        <p>You can upload a file only if:</p>
        <ul>
          <li>your company is allowed to upload it to an outside service like ConstructionAI and to have us process it as these terms describe, under your contract with the owner or agency and any terms the file came with (for example plan-room or bid-set terms);</li>
          <li>it doesn&apos;t break a law, the terms the file came with, or someone else&apos;s rights.</li>
        </ul>
        <p>Don&apos;t upload these without our written OK first:</p>
        <ul>
          <li><strong>Sensitive or restricted plans.</strong> Plans or specs for bridges, tunnels, dams, or other critical infrastructure that an owner or agency marks as security-sensitive, restricted, &quot;for official use only,&quot; or similar, or that come with handling rules that don&apos;t allow storing them with an outside service.</li>
          <li><strong>Files whose terms don&apos;t allow outside services.</strong> Bid sets, plan-room downloads, or other documents whose terms (for example plan-room terms or a non-disclosure agreement) don&apos;t allow your company to upload them to an outside service.</li>
          <li><strong>Personal records beyond what the work needs.</strong> Files with Social Security numbers, bank details, medical information, or similar personal details about workers or others. Redact them first.</li>
        </ul>
        <p>If you uploaded something by mistake, tell us at <FactEmail id="supportEmail" facts={facts} /> and we&apos;ll work with you on removing it (see 2.6).</p>
      </section>

      <section>
        <h2>2.6 Deleting files and records</h2>
        <p>ConstructionAI keeps a fixed history of uploads and decisions, so a pack can always be traced to its source. ConstructionAI doesn&apos;t have a delete option yet. To ask us to remove or erase files, for example after an upload by mistake or when your company leaves the pilot, email <FactEmail id="supportEmail" facts={facts} />.</p>
      </section>

      <section>
        <h2>2.7 Acceptable use</h2>
        <p>Don&apos;t:</p>
        <ul>
          <li>share your sign-in or let someone outside your company use your account;</li>
          <li>try to get into another company&apos;s data, or test, scan, or overload the service without our written OK;</li>
          <li>use ConstructionAI to break the law, or to break the terms of another software provider whose data you bring in;</li>
          <li>copy or resell ConstructionAI.</li>
        </ul>
      </section>

      <section>
        <h2>2.8 Pilot status</h2>
        <p>ConstructionAI is in a pilot. Features may change, break, or be removed. We provide it &quot;as is&quot; for the pilot. <FactText id="warrantyDisclaimer" facts={facts} /></p>
      </section>

      <section>
        <h2>2.9 Changes to these terms</h2>
        <p>If we change these terms, we&apos;ll post the new version with a new effective date and ask you to accept it again before your next upload.</p>
      </section>
    </article>
  );
}
