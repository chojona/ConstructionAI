"use client";

import { useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import {
  cardAText,
  cardBText,
  companyFieldError,
  consentHelper,
  dotFieldError,
  emailFieldError,
  joinWaitlistLabel,
  landingEyebrow,
  landingHeadline,
  optionOneLabel,
  pilotFeatureLabel,
  roleFieldError,
  waitlistCloseLabel,
  waitlistCompanyLabel,
  waitlistCompanyPlaceholder,
  waitlistDialogTitle,
  waitlistDotLegend,
  waitlistEmailPlaceholder,
  waitlistInstruction,
  waitlistNo,
  waitlistPickedPrefix,
  waitlistRequired,
  waitlistRoleLabel,
  waitlistRolePlaceholder,
  waitlistWorkEmailLabel,
  waitlistYes,
} from "@/lib/legal/copy";
import { LegalFooterLinks, LegalLogo } from "@/components/legal/legal-chrome";
import { PayEstimateCard } from "@/components/legal/pay-estimate-card";
import { SignupConsent } from "@/components/legal/signup-consent";
import { waitlistFieldErrors, type WaitlistField } from "@/lib/legal/waitlistForm";

type Offer = "a" | "b";
type FieldErrors = Partial<Record<WaitlistField, string>>;

const picked: Record<Offer, string> = {
  a: cardAText,
  b: cardBText,
};

const fieldErrors: Record<Exclude<WaitlistField, "consent">, string> = {
  email: emailFieldError,
  company: companyFieldError,
  role: roleFieldError,
  dot: dotFieldError,
};

export function PilotLanding({
  showLegalLinks = false,
  initialErrors = {},
}: {
  showLegalLinks?: boolean;
  initialErrors?: FieldErrors;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [offer, setOffer] = useState<Offer>("a");
  const [dotWork, setDotWork] = useState<"" | "yes" | "no">("");
  const [errors, setErrors] = useState<FieldErrors>(initialErrors);
  const failed = Object.values(errors).some(Boolean);

  function open(next: Offer) {
    setOffer(next);
    setErrors({});
    dialog.current?.showModal();
  }

  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.querySelector<HTMLInputElement>("[data-field=email]")?.value ?? "";
    const company = form.querySelector<HTMLInputElement>("[data-field=company]")?.value ?? "";
    const role = form.querySelector<HTMLSelectElement>("[data-field=role]")?.value ?? "";
    const consent = Boolean(form.querySelector<HTMLInputElement>("[data-consent=terms]")?.checked);
    setErrors(waitlistFieldErrors({ email, company, role, dotWork, consent }));
  }

  return (
    <div className="pilot-landing">
      <header className="legal-top"><LegalLogo /></header>
      <main className="pilot-main">
        <p className="eyebrow">{landingEyebrow}</p>
        <h1>{landingHeadline}</h1>
        <div className="pilot-cards">
          <article className="pilot-card">
            <p className="pilot-kicker"><span>{optionOneLabel}</span><span className="pilot-feature">{pilotFeatureLabel}</span></p>
            <p>{cardAText}</p>
            <button type="button" className="pilot-join" data-join="a" onClick={() => open("a")}>{joinWaitlistLabel}</button>
          </article>
          <PayEstimateCard onJoin={() => open("b")} />
        </div>
      </main>
      <dialog ref={dialog} className="waitlist-dialog pilot-dialog" aria-labelledby="waitlist-title" onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
        <form className="waitlist-form" onSubmit={join} noValidate>
          <div className="waitlist-head">
            <h2 id="waitlist-title">{waitlistDialogTitle}</h2>
            <button type="button" className="icon-button" aria-label={waitlistCloseLabel} onClick={() => dialog.current?.close()}><X size={18} /></button>
          </div>
          <p className="waitlist-picked">{waitlistPickedPrefix} {picked[offer]}</p>
          {failed ? <p className="waitlist-error-summary" role="alert">{waitlistInstruction}</p> : <p className="waitlist-required">{waitlistRequired}</p>}
          <label>{waitlistWorkEmailLabel}<input className="field" type="email" required autoComplete="off" placeholder={waitlistEmailPlaceholder} data-field="email" aria-invalid={Boolean(errors.email)} aria-describedby="email" /></label>
          <p id="email" className="field-error" data-field-error="email" role="alert" hidden={!errors.email}>{fieldErrors.email}</p>
          <label>{waitlistCompanyLabel}<input className="field" type="text" required autoComplete="off" placeholder={waitlistCompanyPlaceholder} data-field="company" aria-invalid={Boolean(errors.company)} aria-describedby="company" /></label>
          <p id="company" className="field-error" data-field-error="company" role="alert" hidden={!errors.company}>{fieldErrors.company}</p>
          <label>{waitlistRoleLabel}
            <select className="field" required defaultValue="" aria-label={waitlistRoleLabel} data-field="role" aria-invalid={Boolean(errors.role)} aria-describedby="role">
              <option value="">{waitlistRolePlaceholder}</option>
            </select>
          </label>
          <p id="role" className="field-error" data-field-error="role" role="alert" hidden={!errors.role}>{fieldErrors.role}</p>
          <fieldset className="waitlist-choice" aria-describedby="dot" aria-invalid={Boolean(errors.dot)}>
            <legend>{waitlistDotLegend}</legend>
            <label>
              {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- invalid outline stays on the radio */}
              <input type="radio" name="dot-work" value="yes" required checked={dotWork === "yes"} data-field="dot" aria-invalid={Boolean(errors.dot)} onChange={() => setDotWork("yes")} /> {waitlistYes}
            </label>
            <label>
              {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- invalid outline stays on the radio */}
              <input type="radio" name="dot-work" value="no" required checked={dotWork === "no"} data-field="dot" aria-invalid={Boolean(errors.dot)} onChange={() => setDotWork("no")} /> {waitlistNo}
            </label>
          </fieldset>
          <p id="dot" className="field-error" data-field-error="dot" role="alert" hidden={!errors.dot}>{fieldErrors.dot}</p>
          <SignupConsent invalid={Boolean(errors.consent)} />
          <button type="submit" className="waitlist-submit">{joinWaitlistLabel}</button>
          <p className="waitlist-help">{consentHelper}</p>
        </form>
      </dialog>
      {showLegalLinks ? <LegalFooterLinks /> : null}
    </div>
  );
}
