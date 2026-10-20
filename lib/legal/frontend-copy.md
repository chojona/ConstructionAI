# ConstructionAI — Frontend legal copy

DRAFT — pending attorney review. Prepared by Grok Bot (Legal), not a licensed attorney. Nothing here is legal advice.

How to read this file:
- One block per item. Each block maps to a Design surface.
- `[CTO CONFIRM: ...]` marks every statement about how we handle data. CTO checks each one against the running system before launch. The repo path in the marker is where the statement came from (repo `chojona/ConstructionAI`, HEAD `ed61c60`).
- `[CTO RESULT: ...]` records what CTO found on main (`ed61c6020ae7`) on Oct 19, 2026, where a marker was checked but still carries a fact or to-do. Confirmed markers whose copy now matches were removed.
- `[PLACEHOLDER: ...]` means we still need to fill in a fact (legal entity name, address, contact email).
- Copy rules (enforced in every block below):
  1. No legal advice and no claims advice anywhere in the app or on the site.
  2. No absolute claims ("secure", "bank-grade", "encrypted", "we never store files", "fully compliant", "guaranteed") unless the copy says exactly how. FTC Act Sec. 5 deception risk.
  3. No copy that says or implies ConstructionAI reviews, checks, verifies, or certifies a customer's lines, quantities, or pay requests. The contractor reviews and approves its own lines and stays responsible for what it submits.

---

## 1. /privacy — Privacy and Data Deletion Note

DRAFT — pending attorney review

Version: v0.1-draft
Effective date: [EFFECTIVE DATE]

### 1.1 Who we are
DRAFT — pending attorney review

ConstructionAI is operated by [PLACEHOLDER: legal entity name], [PLACEHOLDER: postal address]. Questions about this note: [PLACEHOLDER: privacy contact email].

ConstructionAI is a business tool for construction contractors. This note covers our website, the pilot waitlist, and the ConstructionAI app.

### 1.2 What we collect on the waitlist
DRAFT — pending attorney review

When you join the pilot waitlist, we ask for:
- your work email
- your company name
- your role
- whether your company bids DOT or heavy civil work
- the date and time you agreed, and the version of the Terms and Privacy Policy you agreed to (one version number covers both documents)
- which page and offer card you signed up from

[CTO RESULT: CON-153 decision (Oct 19): `source` is a fixed page label (`landing_page` or `manual_import`) and `offerCard` is `card_a` or `card_b`; neither holds referrer or tracking data. Consent is stored as the agreement time plus one version number covering both the Terms and Privacy Policy. Not built yet on main. If either field ever holds referrer, UTM, or other tracking data, this list and the "no hidden tracking fields" line must change.]

After you sign up, you can answer up to six optional questions about your work. You can skip them.
[CTO CONFIRM: optional answers stored in a separate `WaitlistAnswers` table, each answer capped at 2,000 characters. Source: CON-153.]

We don't ask for a phone number on the waitlist, and we don't accept file uploads there.
[CTO CONFIRM: CON-153 says "no phone number, no file upload, no hidden tracking fields".]

### 1.3 What we collect in the app
DRAFT — pending attorney review

When your company uses the app, we store:
- **Account details:** your email, your name if you give it, a hash of your password (not the password itself), your access level in the app (admin, reviewer, contributor, or viewer), and whether your invite is pending, active, or disabled. While your invite is pending, we also keep a hash of your invite link, which expires after 14 days.
- **Sign-in records:** a session record so you stay signed in. The cookie holds a token and our database keeps only a hash of it. A session lasts 14 days from sign-in; after that you sign in again.
- **Failed sign-in attempts:** the email entered and the IP address, for failed sign-ins and failed attempts to use an invite link, so we can slow down repeated failed attempts. We keep these login records for up to 30 days. [DO NOT PUBLISH until the LoginAttempt purge PR merges] [CTO RESULT: `LoginAttempt{email, ip, createdAt}` (`lib/auth/loginRateLimit.ts`); also records failed invite-accept attempts (email empty when the token doesn't identify a person). Today on main: rows older than the 15-minute window are deleted at the start of the next sign-in or invite-accept attempt, and a successful sign-in deletes that email's rows; there is no scheduled purge, so with no further attempts rows stay indefinitely. "Up to 30 days" becomes true only once the purge PR ships.]
- **Files you upload:** PDF files (for example plan sets and specs), Bluebeam markup summaries as PDF or CSV files, the original file name, the document title and revision label you enter, and the text we read from each PDF page. Each PDF can be up to 4,400,000 bytes (about 4.4 MB) and 500 pages.
- **Bluebeam markup summaries:** CSV markup summaries you upload can include reviewers' names or logins and the text of their comments. [CTO CONFIRM: which CSV columns are stored as uploaded (`lib/review/bluebeamAppendix.ts`); if the raw file is kept, all of them are.]
- **Your review work:** the items the app suggests from your documents, and the accept, dismiss, or flag decisions your team makes on them, with who made each decision, when, and any reason or note added to it.
- **Packs and email drafts:** approved packs your team exports, files attached to them, and email drafts your team writes in the app, including recipient addresses. The app records these drafts but does not send email.

### 1.4 Where your data is kept
DRAFT — pending attorney review

The app runs on Vercel. Account and project records are kept in a Neon PostgreSQL database. Uploaded files and exported packs are kept with an S3-compatible object storage provider. [PLACEHOLDER: storage provider name and region, once confirmed]
[CTO CONFIRM: Vercel hosting and Neon Postgres are confirmed. The storage code is a generic S3 client (`@aws-sdk/client-s3`, `lib/storage/objectStore.ts`), not Neon-specific: the provider is whatever `OBJECT_STORAGE_ENDPOINT` / `AWS_ENDPOINT_URL_S3` points to in Vercel, region `OBJECT_STORAGE_REGION` → `AWS_REGION` → default `us-east-1`. Don't name a storage provider or region, and don't say the bucket is private, until Jonathan confirms the production endpoint, region, and the provider's bucket privacy setting. The code never sets a public ACL or sends storage URLs to the browser.]

Service providers that handle data for us: Vercel (hosting), Neon (database), and [PLACEHOLDER: storage provider]. [CTO CONFIRM: storage provider name once the production endpoint is confirmed. No AI provider: `OPENAI_*` names appear in `.env.example`, but no code reads them and there is no AI SDK in `package.json`; the only outbound calls are to Postgres and the S3 endpoint. Do not list OpenAI unless it is turned on; if it is, add it here and say what is sent to it.]

[CTO RESULT: encryption. Database connection strings use `sslmode=require` (`.env.example`) and the S3 client uses an HTTPS endpoint. Uploads set no server-side encryption parameter (`PutObjectCommand`). Neon's docs say bucket-encryption settings aren't supported over its S3 API, so at-rest encryption can't be confirmed from the repo. Say nothing about encryption at rest until Neon or the provider dashboard confirms it, and then describe it exactly.]

### 1.5 How we use it
DRAFT — pending attorney review

- Waitlist details: to contact you about the waitlist and pilot, to learn about your work from any optional answers, and to send product updates if you ask for them.
- App data: to run the app for your company, keep your account working, and limit repeated failed sign-ins.

We don't sell your data. We don't use third-party advertising or analytics tools on the site or in the app.

We don't use your uploaded files or your review work to train AI models.

### 1.6 Cookies and browser storage
DRAFT — pending attorney review

We use one cookie to keep you signed in. The app also saves two things in your browser's local storage: whether you collapsed the sidebar, and the reviewer name you type on the review screen. We don't use advertising or tracking cookies. Fonts load from our own site, with no request to Google.

### 1.7 Deleting your data
DRAFT — pending attorney review

**Waitlist.** To have your waitlist signup deleted, email [PLACEHOLDER: privacy contact email] from the address you signed up with. We remove the signup and any optional answers by hand. [DO NOT PUBLISH until CON-153 and its removal script merge]
[CTO RESULT: no waitlist deletion script exists (`scripts/` has 4 unrelated files) and no waitlist tables exist yet. The copy says "by hand" and makes no script claim; keep it that way until a script exists. Leave the response time out until we can meet one: [PLACEHOLDER: response time].]

**App accounts.** An admin at your company can disable a person's access. Disabling stops sign-in. It doesn't erase that person's records, because their review decisions stay part of the project record.

**Uploaded files and project records.** The app keeps project records, including uploaded files, as a fixed history, so a pack can always be traced to its source. ConstructionAI doesn't have a delete option yet. To ask us to remove a file, or to erase your company's data (for example when your company leaves the pilot), email [PLACEHOLDER: privacy contact email]. [NOTE: publish this paragraph now; the DO NOT PUBLISH lines below are added when the removal-script PR merges.]
[UPDATE WHEN CON-143 SHIPS: CON-143 plans "delete = hide, never remove" (`archivedAt/archivedBy`). Nothing from it is on main. When it ships, update this paragraph to say deleting hides a file and does not destroy it. No object lock during the pilot; later, governance mode with an admin override (CTO decision, Oct 19).]

We can remove files on request, and we'll confirm in writing when it's done. [DO NOT PUBLISH until the removal-script PR merges]
Removing a file also removes it from any pack stored in ConstructionAI. Copies you've already downloaded or shared aren't affected. [DO NOT PUBLISH until the removal-script PR merges]
Backups and database history may keep copies for [PLACEHOLDER: period] after we remove a file. [DO NOT PUBLISH until the removal-script PR merges]
[CTO CONFIRM: there is no erase process or script today. CTO plan: Jonathan runs a removal script after a written request; it deletes and commits the database rows first, then deletes the stored files (`lib/storage/objectStore.ts`), and logs any file delete that fails so it can be retried; it also removes `export-packets/{projectId}/*.json`; it dry-runs by default; and it keeps a log of each removal. The script is not in the repo yet; publish the removal wording only after its PR merges. Confirm the script also removes the file from every pack stored in ConstructionAI. CTO caveats for the script: (1) `Restrict` FKs mean dependent rows must be deleted in order (pages, evidence, facts, decisions, packs, emails); (2) packs are content-addressed frozen snapshots, so removing a file from a pack means deleting or rewriting that pack and its `EmailSendDocument`/decision links, and legacy packs may still hold bytes in `ExportPacket.payload`; (3) Neon's docs say `DeleteObject` soft-deletes, and Neon branches and point-in-time history can keep copies for a while; confirm with Neon how long until bytes are really gone, fill in the backups period, and don't call it erased until then. No object lock during the pilot (CTO decision, Oct 19).]

### 1.8 Changes to this note
DRAFT — pending attorney review

If we change this note, we'll post the new version here with a new effective date. If the change is significant, we'll also tell signed-up users by email before it applies.

---

## 2. /terms — Pilot Terms of Use

DRAFT — pending attorney review

Version: v0.1-draft
Effective date: [EFFECTIVE DATE]

### 2.1 Who these terms are with
DRAFT — pending attorney review

These terms are between [PLACEHOLDER: legal entity name] ("we") and the company that uses ConstructionAI ("you" or "your company"). The person accepting them confirms they can accept on behalf of their company. If your company has signed a separate pilot agreement with us, that agreement wins where it conflicts with these terms.

### 2.2 What ConstructionAI does and doesn't do
DRAFT — pending attorney review

In the pilot, ConstructionAI shows the current revision of each sheet with its source page, lets your team compare versions, mark them reviewed, and export a pack.

ConstructionAI also reads the PDFs you upload and suggests items, such as dates, quantities, and equipment, each with the page it came from. Your team decides what to accept, dismiss, or flag.

Suggestions can be wrong or incomplete. You review and approve every line before you use it in a pay request, change order, claim, notice, or any other submission. Your company is responsible for what it submits to an owner, agency, or anyone else.

ConstructionAI does not give legal, claims, contract, or accounting advice.

### 2.3 Your files belong to you
DRAFT — pending attorney review

You own the files and data you upload and the decisions your team records ("Your Content"). These terms don't transfer ownership of Your Content to us.

### 2.4 What we may do with Your Content
DRAFT — pending attorney review

You let us store, copy, and process Your Content only to:
- run ConstructionAI for your company;
- fix problems you report and keep the service working;
- meet a legal requirement.

We won't sell Your Content, share it with another customer, or use it to train AI models. [DO NOT PUBLISH until CON-133, CON-134 and #103 are closed]
[CTO RESULT: all 19 gated API routes call `authorizeRequest` (`lib/auth/membership.ts`), which needs an ACTIVE membership in the org, and repository queries filter by `organizationId`. No Postgres RLS. CON-141 is open PR #103 (not merged), so main has no cross-org tests yet; CON-142 (RLS) is Backlog. No AI training is confirmed (`lib/extractions/deterministicExtractor.ts`). Keep the DO NOT PUBLISH tag.]

Sample data in the app's demo projects is not Your Content.

### 2.5 Upload rules
DRAFT — pending attorney review

You can upload a file only if:
- your company is allowed to upload it to an outside service like ConstructionAI and to have us process it as these terms describe, under your contract with the owner or agency and any terms the file came with (for example plan-room or bid-set terms);
- it doesn't break a law, the terms the file came with, or someone else's rights.

Don't upload these without our written OK first:
- **Sensitive or restricted plans.** Plans or specs for bridges, tunnels, dams, or other critical infrastructure that an owner or agency marks as security-sensitive, restricted, "for official use only," or similar, or that come with handling rules that don't allow storing them with an outside service.
- **Files whose terms don't allow outside services.** Bid sets, plan-room downloads, or other documents whose terms (for example plan-room terms or a non-disclosure agreement) don't allow your company to upload them to an outside service. [ATTORNEY QUESTION: see compliance-checklist.md, Attorney questions #1.]
- **Personal records beyond what the work needs.** Files with Social Security numbers, bank details, medical information, or similar personal details about workers or others. Redact them first.

If you uploaded something by mistake, tell us at [PLACEHOLDER: support email] and we'll work with you on removing it (see 2.6).

[CTO RESULT: document uploads are PDF only (`lib/documents/validateUpload.ts`), and pack appendices also accept Bluebeam markup summaries as CSV (`lib/review/bluebeamAppendix.ts`). No OCR and no detection of restricted plans. These rules depend on the customer, so the accept-terms step (section 5) is how we put them in front of users.]

### 2.6 Deleting files and records
DRAFT — pending attorney review

ConstructionAI keeps a fixed history of uploads and decisions, so a pack can always be traced to its source. ConstructionAI doesn't have a delete option yet. To ask us to remove or erase files, for example after an upload by mistake or when your company leaves the pilot, email [PLACEHOLDER: support email]. [NOTE: publish this paragraph now; the DO NOT PUBLISH lines below are added when the removal-script PR merges.]

We can remove files on request, and we'll confirm in writing when it's done. [DO NOT PUBLISH until the removal-script PR merges]
Removing a file also removes it from any pack stored in ConstructionAI. Copies you've already downloaded or shared aren't affected. [DO NOT PUBLISH until the removal-script PR merges]
Backups and database history may keep copies for [PLACEHOLDER: period] after we remove a file. [DO NOT PUBLISH until the removal-script PR merges]
[CTO CONFIRM: same facts as /privacy 1.7. CTO plan: Jonathan runs a removal script after a written request; it deletes and commits the database rows first, then deletes the stored files (`lib/storage/objectStore.ts`), and logs any file delete that fails so it can be retried; it also removes `export-packets/{projectId}/*.json`; it dry-runs by default; and it keeps a log of each removal. The script is not in the repo yet; publish the removal wording only after its PR merges. Confirm the script also removes the file from every pack stored in ConstructionAI. Same caveats as /privacy 1.7. No delete feature on main; CON-143 plans hide-not-destroy and a versioned bucket (Neon's docs say versioning and lifecycle settings are "stored but not enforced", so re-check that plan against the provider). CTO decision (Oct 19): no object lock during the pilot; CON-143 will use governance mode with an admin override, so removal on request stays possible. When CON-143 ships, update this section to say deleting hides a file and does not destroy it.]

### 2.7 Acceptable use
DRAFT — pending attorney review

Don't:
- share your sign-in or let someone outside your company use your account;
- try to get into another company's data, or test, scan, or overload the service without our written OK;
- use ConstructionAI to break the law, or to break the terms of another software provider whose data you bring in;
- copy or resell ConstructionAI.

### 2.8 Pilot status
DRAFT — pending attorney review

ConstructionAI is in a pilot. Features may change, break, or be removed. We provide it "as is" for the pilot. [PLACEHOLDER: warranty disclaimer, liability limit, fees (if any), term and termination, governing law. Attorney to draft; I have not written these.]

### 2.9 Changes to these terms
DRAFT — pending attorney review

If we change these terms, we'll post the new version with a new effective date and ask you to accept it again before your next upload.

---

## 3. Footer links

DRAFT — pending attorney review

Shown on the landing page, the waitlist modal, /login, /accept, and in the app sidebar footer.

`Privacy and data deletion` → /privacy
`Terms` → /terms
`Contact` → mailto:[PLACEHOLDER: contact email]
`© [YEAR] [PLACEHOLDER: legal entity name]`

[CTO RESULT: confirmed. `SidebarFooter` (`components/workspace/app-shell.tsx`) has no legal links, and /login and /accept render without the app shell. Add the links in both places.]

---

## 4. Signup consent line (waitlist step 1)

DRAFT — pending attorney review

Box 1. Required, unchecked by default:

`I agree to the [Terms](/terms) and [Privacy Policy](/privacy).`

Notice line (plain text, not a checkbox), directly under box 1:

`We'll email you about the waitlist and pilot. You can unsubscribe anytime.`

Box 2. Optional, unchecked by default, separate from box 1:

`Email me product updates.`

Small text directly under box 2:

`We record the date you agreed and the version of the Terms and Privacy Policy you agreed to. One version number covers both documents.`

Helper text under the submit button (keep the current Design line, edited so it's still true once box 2 exists):

`We use your details to contact you about the pilot, and to send product updates only if you ask for them.`

Error if box 1 isn't checked:

`Check the box to agree to the Terms and Privacy Policy.`

[CTO RESULT: CON-153 decision (Oct 19): store the agreement time plus one consent version that covers both the Terms and Privacy Policy (bump the version when either document changes, and keep a record of which document texts each version means), and store the product-updates opt-in separately with its own time. Nothing built on main yet.]

---

## 5. Accept-terms step before first upload

DRAFT — pending attorney review

Shown once per person before their first upload, and again after the terms change. Upload stays disabled until the box is checked.

Title:
`Before you upload`

Body:
`You own what you upload. We store and process it only to run ConstructionAI for your company, fix problems you report and keep the service working, and meet a legal requirement. Suggestions can be wrong. You review and approve every line before you use it. This isn't legal or claims advice.`

`Don't upload plans marked security-sensitive or critical-infrastructure information (for example some bridge or tunnel plans), files whose terms don't allow uploading them to an outside service, or files with personal details the work doesn't need, unless we've agreed in writing.`

`ConstructionAI doesn't have a delete option yet. To ask us to remove a file, contact us.`

`Removing a file also removes it from any pack stored in ConstructionAI. Copies you've already downloaded or shared aren't affected.` [DO NOT PUBLISH until the removal-script PR merges]

Checkbox (required):
`I agree to the [Terms](/terms). I confirm my company is allowed to upload these files to an outside service like ConstructionAI, and that none are marked security-sensitive or critical-infrastructure information, unless ConstructionAI has agreed in writing.`

Buttons:
`Continue to upload` (disabled until checked) · `Cancel`

[CTO RESULT: no accept-terms step exists on main. Store user id, terms version, and acceptance time server-side (new table; ships as a separate PR after #105). All four routes that accept customer files must refuse uploads from a user with no current acceptance: `app/api/documents/[documentId]/revisions/route.ts`, `app/api/projects/[projectId]/documents/route.ts`, `app/api/projects/[projectId]/export/chapters/route.ts` (ACC/RFI PDFs), and `app/api/projects/[projectId]/export/appendices/route.ts` (Bluebeam PDF or CSV). CON-143 plans hide-not-destroy; when it ships, update line 3 to say deleting hides a file and does not destroy it. CTO plan: Jonathan runs a removal script after a written request; it deletes and commits the database rows first, then deletes the stored files (`lib/storage/objectStore.ts`), and logs any file delete that fails so it can be retried; it also removes `export-packets/{projectId}/*.json`; it dry-runs by default; and it keeps a log of each removal. The script is not in the repo yet; publish the removal wording only after its PR merges.]

---

## 6. Card B caption (pay-estimate quantity check)

DRAFT — pending attorney review

`You review and approve every line before it's used in a pay request. This isn't legal or claims advice.`

Note for Design: label card B as a pilot feature (show a `Pilot feature` label on the card).

Approved card text:

`Check your installed quantities against the DOT's monthly pay estimate. Gaps are flagged with their source page.`

This text tells the contractor to do the check, which is fine. Don't change it to wording that says ConstructionAI checks, verifies, or confirms lines.

---

## 7. Waitlist email opt-out footer

DRAFT — pending attorney review

Put this at the bottom of every email to the waitlist:

`You're getting this because you joined the ConstructionAI pilot waitlist. [Unsubscribe](UNSUBSCRIBE_URL) and we'll stop emailing you.`
`[PLACEHOLDER: legal entity name] · [PLACEHOLDER: physical postal address]`

[CTO RESULT: confirmed. No email sending, no mail SDK, and no unsubscribe route or table on main (`lib/email/noAutoSendGuard.ts`). Before any waitlist email goes out: pick the sender, build the one-click unsubscribe link, record opt-outs, and stop sending to anyone who opted out. The opt-out must keep working for at least 30 days after each email is sent, and requests must be honored within 10 business days (CAN-SPAM; attorney to confirm). The postal address must be a "valid physical postal address" under 16 CFR 316.2(p): the sender's current street address, a P.O. box the sender has accurately registered with USPS, or a private mailbox the sender has accurately registered with a commercial mail receiving agency established under USPS regulations. If you use a P.O. box or virtual mailbox, it has to meet that definition.]
