import { consentError, consentNotice, consentUpdates, consentVersionNote } from "@/lib/legal/copy";

/** Markup only. The waitlist form that wraps this does not submit or store anything. */
export function SignupConsent() {
  return (
    <div className="consent-block" data-legal="consent">
      <label className="consent-check">
        <input type="checkbox" data-consent="terms" defaultChecked={false} />
        <span>I agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</span>
      </label>
      <p className="consent-error" data-consent-error role="alert" hidden>{consentError}</p>
      <p className="consent-note">{consentNotice}</p>
      <label className="consent-check">
        <input type="checkbox" data-consent="updates" defaultChecked={false} />
        <span>{consentUpdates}</span>
      </label>
      <p className="consent-version">{consentVersionNote}</p>
    </div>
  );
}
