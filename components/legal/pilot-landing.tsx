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

export function PilotLanding({ showLegalLinks = false }: { showLegalLinks?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [offer, setOffer] = useState<Offer>("a");
  const [dotWork, setDotWork] = useState<"" | "yes" | "no">("");

  function clearErrors(form: ParentNode) {
    for (const alert of form.querySelectorAll<HTMLElement>("[data-field-error], [data-consent-error]")) {
      alert.hidden = true;
    }
    for (const control of form.querySelectorAll<HTMLElement>("[aria-invalid]")) {
      control.setAttribute("aria-invalid", "false");
    }
  }

  function open(next: Offer) {
    setOffer(next);
    if (dialog.current) clearErrors(dialog.current);
    dialog.current?.showModal();
  }

  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.querySelector<HTMLInputElement>("[data-field=email]")?.value ?? "";
    const company = form.querySelector<HTMLInputElement>("[data-field=company]")?.value ?? "";
    const role = form.querySelector<HTMLSelectElement>("[data-field=role]")?.value ?? "";
    const selectedDot = form.querySelector<HTMLInputElement>("[data-field=dot]:checked")?.value ?? "";
    const consent = Boolean(form.querySelector<HTMLInputElement>("[data-consent=terms]")?.checked);
    const errors = waitlistFieldErrors({ email, company, role, dotWork: selectedDot, consent });
    for (const field of ["email", "company", "role", "dot"] as const) {
      const alert = form.querySelector<HTMLElement>(`[data-field-error="${field}"]`);
      const invalid = Boolean(errors[field]);
      if (alert) alert.hidden = !invalid;
      for (const control of form.querySelectorAll<HTMLElement>(`[data-field="${field}"]`)) {
        control.setAttribute("aria-invalid", invalid ? "true" : "false");
      }
    }
    const consentAlert = form.querySelector<HTMLElement>("[data-consent-error]");
    const consentBox = form.querySelector<HTMLInputElement>("[data-consent=terms]");
    if (consentAlert) consentAlert.hidden = !errors.consent;
    consentBox?.setAttribute("aria-invalid", errors.consent ? "true" : "false");
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
      <dialog ref={dialog} className="waitlist-dialog" aria-labelledby="waitlist-title" onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
        <form className="waitlist-form" onSubmit={join} noValidate>
          <div className="waitlist-head">
            <h2 id="waitlist-title">{waitlistDialogTitle}</h2>
            <button type="button" className="icon-button" aria-label={waitlistCloseLabel} onClick={() => dialog.current?.close()}><X size={18} /></button>
          </div>
          <p className="waitlist-picked">{waitlistPickedPrefix} {picked[offer]}</p>
          <p className="waitlist-required">{waitlistInstruction}</p>
          <label>{waitlistWorkEmailLabel}<input className="field" type="email" required autoComplete="off" placeholder={waitlistEmailPlaceholder} data-field="email" /></label>
          <p className="field-error" data-field-error="email" role="alert" hidden>{fieldErrors.email}</p>
          <label>{waitlistCompanyLabel}<input className="field" type="text" required autoComplete="off" placeholder={waitlistCompanyPlaceholder} data-field="company" /></label>
          <p className="field-error" data-field-error="company" role="alert" hidden>{fieldErrors.company}</p>
          <label>{waitlistRoleLabel}
            <select className="field" required defaultValue="" aria-label={waitlistRoleLabel} data-field="role">
              <option value="">{waitlistRolePlaceholder}</option>
            </select>
          </label>
          <p className="field-error" data-field-error="role" role="alert" hidden>{fieldErrors.role}</p>
          <fieldset className="waitlist-choice">
            <legend>{waitlistDotLegend}</legend>
            <label><input type="radio" name="dot-work" value="yes" required checked={dotWork === "yes"} data-field="dot" onChange={() => setDotWork("yes")} /> {waitlistYes}</label>
            <label><input type="radio" name="dot-work" value="no" required checked={dotWork === "no"} data-field="dot" onChange={() => setDotWork("no")} /> {waitlistNo}</label>
          </fieldset>
          <p className="field-error" data-field-error="dot" role="alert" hidden>{fieldErrors.dot}</p>
          <SignupConsent />
          <button type="submit" className="waitlist-submit">{joinWaitlistLabel}</button>
          <p className="waitlist-help">{consentHelper}</p>
        </form>
      </dialog>
      {showLegalLinks ? <LegalFooterLinks /> : null}
    </div>
  );
}
