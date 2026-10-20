"use client";

import { useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import {
  cardAText,
  cardBText,
  consentHelper,
  joinWaitlistLabel,
  landingEyebrow,
  landingHeadline,
  optionOneLabel,
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

type Offer = "a" | "b";

const picked: Record<Offer, string> = {
  a: cardAText,
  b: cardBText,
};

export function PilotLanding({ showLegalLinks = false }: { showLegalLinks?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [offer, setOffer] = useState<Offer>("a");
  const [dotWork, setDotWork] = useState<"" | "yes" | "no">("");

  function open(next: Offer) {
    setOffer(next);
    const alert = dialog.current?.querySelector<HTMLElement>("[data-consent-error]");
    if (alert) alert.hidden = true;
    dialog.current?.showModal();
  }

  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const box = form.querySelector<HTMLInputElement>("[data-consent=terms]");
    const alert = form.querySelector<HTMLElement>("[data-consent-error]");
    const agreed = Boolean(box?.checked);
    if (alert) alert.hidden = agreed;
    box?.setAttribute("aria-invalid", agreed ? "false" : "true");
  }

  return (
    <div className="pilot-landing">
      <header className="legal-top"><LegalLogo /></header>
      <main className="pilot-main">
        <p className="eyebrow">{landingEyebrow}</p>
        <h1>{landingHeadline}</h1>
        <div className="pilot-cards">
          <article className="pilot-card">
            <p className="pilot-kicker"><span>{optionOneLabel}</span></p>
            <p>{cardAText}</p>
            <button type="button" className="pilot-join" data-join="a" onClick={() => open("a")}>{joinWaitlistLabel}</button>
          </article>
          <PayEstimateCard pilot onJoin={() => open("b")} />
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
          <label>{waitlistWorkEmailLabel}<input className="field" type="email" autoComplete="off" placeholder={waitlistEmailPlaceholder} /></label>
          <label>{waitlistCompanyLabel}<input className="field" type="text" autoComplete="off" placeholder={waitlistCompanyPlaceholder} /></label>
          <label>{waitlistRoleLabel}
            <select className="field" defaultValue="" aria-label={waitlistRoleLabel}>
              <option value="">{waitlistRolePlaceholder}</option>
            </select>
          </label>
          <fieldset className="waitlist-choice">
            <legend>{waitlistDotLegend}</legend>
            <label><input type="radio" checked={dotWork === "yes"} onChange={() => setDotWork("yes")} /> {waitlistYes}</label>
            <label><input type="radio" checked={dotWork === "no"} onChange={() => setDotWork("no")} /> {waitlistNo}</label>
          </fieldset>
          <SignupConsent />
          <button type="submit" className="waitlist-submit">{joinWaitlistLabel}</button>
          <p className="waitlist-help">{consentHelper}</p>
        </form>
      </dialog>
      {showLegalLinks ? <LegalFooterLinks /> : null}
    </div>
  );
}
