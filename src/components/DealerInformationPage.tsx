import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, ShieldCheck } from 'lucide-react';
import { trackPageView } from '../utils/analytics';
import { WailtailLogo } from './WailtailLogo';
import { ConsignmentModal } from './ConsignmentModal';
import { LegalModal } from './LegalModal';
import { HowItWorksModal, HowItWorksTab } from './HowItWorksModal';

const steps = [
  ['Apply with a vehicle', 'Submit your dealership’s legal name, licence and licensing province, representative contact details, and a vehicle you own. This is one combined dealer and vehicle application.'],
  ['Complete manual verification', 'An administrator reviews your business credentials and confirms the identity and authority of one primary representative. Use an account with a verified email so it can be linked to your dealership.'],
  ['Prepare your listing', 'Vehicle approval is separate from dealer verification. Once assigned a private draft, your representative can add the story, photos and documents, then submit it for curation.'],
  ['Review, publish and sell', 'Curators review the listing and may request revisions. An administrator controls publication and scheduling. After a successful auction, buyer and dealer arrange payment, applicable taxes and vehicle handover directly.']
];

const questions = [
  ['Does applying make us a verified dealer?', 'No. Applications and declarations are reviewed manually. Business verification does not automatically approve a vehicle, create a public listing or grant administrator access. Each additional vehicle requires its own reviewed application.'],
  ['Can we list vehicles for customers or other dealers?', 'No. The dealership must exclusively own the vehicle and be the legal seller of record. Brokered vehicles, third-party consignments and pass-through inventory are outside this program.'],
  ['What does the verification badge mean?', 'It reflects current platform verification of the dealership. It is not provincial regulatory endorsement, a vehicle inspection, or a guarantee of condition, title or sale. Buyers should perform their own due diligence.'],
  ['Who can manage our listings?', 'One primary authorized representative is linked to the dealership. Assigned draft access does not require an automatic seller-role promotion. Multi-seat dealership access and shared logins are not supported.'],
  ['What information is public?', 'Published listings show dealer business attribution, city/province, documentation fee and informational tax handling. Canonical verification records and private findings are not public. Phone or website display requires explicit consent and the applicable publication checks.'],
  ['Can we upload photos and inspection reports?', 'Yes, after a private listing draft is assigned. Hero photos accept JPG/JPEG and PNG; the gallery also accepts PDF documents. Select multiple files, up to 2 MiB each. Files remain private until administrator publication. Previously published copies may remain accessible after a listing is withdrawn.'],
  ['How long does approval take?', 'The founding dealer pilot is curated manually. Submission does not guarantee acceptance or a publication date. Complete credentials, ownership information and clear vehicle disclosures help the review proceed.']
];

export const DealerInformationPage: React.FC = () => {
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | null>(null);
  const [guideTab, setGuideTab] = useState<HowItWorksTab | null>(null);
  const applicationTrigger = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayOpen = useRef(false);
  useEffect(() => { overlayOpen.current = Boolean(legalTab || guideTab); }, [legalTab, guideTab]);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Verified Dealer Program — Wailtail';
    trackPageView(window.location.pathname + window.location.search, document.title);
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (!applicationOpen) return;
    const dialog = modalRef.current;
    const focusable = () => (Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], [tabindex="0"]'
    ) ?? []) as HTMLElement[]).filter(element => !element.hasAttribute('disabled') && element.checkVisibility());
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || overlayOpen.current) return;
      const elements = focusable();
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); applicationTrigger.current?.focus(); };
  }, [applicationOpen]);

  const openApplication = () => {
    applicationTrigger.current = document.activeElement as HTMLElement;
    setApplicationOpen(true);
  };
  const applyClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-3 text-sm font-bold text-zinc-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500';

  return <div className="min-h-screen bg-[#f7f8fa] text-zinc-900 font-sans">
    <a href="#dealer-content" className="sr-only focus:not-sr-only focus:block focus:p-3">Skip to dealer information</a>
    <header className="bg-[#121619] text-white border-b border-white/10">
      <nav aria-label="Dealer page navigation" className="max-w-7xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between gap-4">
        <a href="/catalog" aria-label="Wailtail home" className="flex items-center gap-3">
          <WailtailLogo className="h-9 w-12" theme="dark" variant="icon" />
          <span className="text-xl font-black italic tracking-tight">WAILTAIL</span>
        </a>
        <a href="/catalog" className="text-sm font-semibold text-zinc-300 hover:text-white">View auctions <ChevronRight className="inline w-4 h-4" aria-hidden="true" /></a>
      </nav>
    </header>
    <main id="dealer-content">
      <section className="bg-[#121619] text-white">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-12 pb-16 sm:pt-20 sm:pb-24 grid lg:grid-cols-[1.3fr_1fr] gap-12 items-center">
          <div className="max-w-2xl">
            <p className="text-amber-400 text-xs font-bold tracking-[0.18em] uppercase mb-5">Founding dealer program · Canada</p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold leading-[1.08]">Your inventory.<br />A collector’s next chapter.</h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-300">Bring your dealership’s classic, collector and enthusiast vehicles to Wailtail. A curated auction presentation, direct buyer relationships and a transparent CAD fee model.</p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <button type="button" onClick={openApplication} className={applyClass}>Apply as a dealer <ArrowRight className="w-4 h-4" aria-hidden="true" /></button>
              <a href="#dealer-process" className="text-sm font-semibold underline underline-offset-4 text-zinc-200">See how it works</a>
            </div>
            <p className="mt-4 text-xs text-zinc-400">Manual review. No automatic approval or public listing.</p>
          </div>
          <aside aria-label="Current program fees" className="rounded-2xl border border-white/15 bg-white/5 p-6 sm:p-8">
            <ShieldCheck className="w-8 h-8 text-amber-400 mb-5" aria-hidden="true" />
            <h2 className="text-2xl font-serif font-bold">Built for a direct sale</h2>
            <dl className="mt-6 divide-y divide-white/10">
              {[['Dealer listing fee', '$0 CAD'], ['Platform success commission', '0%'], ['Buyer premium', '0%'], ['Dealer documentation fee', '$0 CAD required']].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-4 text-sm"><dt className="text-zinc-300">{label}</dt><dd className="font-bold text-white text-right">{value}</dd></div>)}
            </dl>
            <p className="text-xs text-zinc-400 leading-relaxed mt-5">Current Phase 1 program. Applicable taxes are separate. Wailtail does not calculate or collect tax, process payments or hold vehicle funds.</p>
          </aside>
        </div>
      </section>

      <section aria-labelledby="dealer-eligibility" className="max-w-7xl mx-auto px-5 sm:px-8 py-14 sm:py-20 grid lg:grid-cols-2 gap-8 lg:gap-20">
        <div><p className="text-red-700 text-xs font-bold tracking-widest uppercase mb-3">Who it’s for</p><h2 id="dealer-eligibility" className="text-3xl sm:text-4xl font-serif font-bold">Independent dealers.<br />Vehicles you own.</h2><p className="mt-5 text-zinc-600 leading-relaxed">We’re welcoming a small founding group of licensed Canadian boutique dealerships. Every business and every vehicle receives a separate review before publication.</p></div>
        <ul className="space-y-5">{['A licensed Canadian dealership with current, verifiable credentials.', 'Exclusive dealership ownership of the vehicle and legal seller-of-record status.', 'One authorized representative with a verified-email account.', 'Accurate condition, history and ownership disclosures, with a $0 CAD documentation fee.'].map(item => <li key={item} className="flex gap-3 leading-relaxed"><Check className="w-5 h-5 text-emerald-700 shrink-0 mt-1" aria-hidden="true" /><span>{item}</span></li>)}</ul>
      </section>

      <section id="dealer-process" aria-labelledby="dealer-process-title" className="bg-white border-y border-zinc-200 scroll-mt-6">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <p className="text-red-700 text-xs font-bold tracking-widest uppercase mb-3">From application to auction</p>
          <h2 id="dealer-process-title" className="text-3xl sm:text-4xl font-serif font-bold">A clear process, with a human review.</h2>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mt-10">{steps.map(([title, description], index) => <li key={title} className="border-t-2 border-zinc-200 pt-5"><span className="text-sm font-bold text-red-700">0{index + 1}</span><h3 className="font-bold text-lg mt-3">{title}</h3><p className="text-sm text-zinc-600 leading-relaxed mt-3">{description}</p></li>)}</ol>
        </div>
      </section>

      <section aria-labelledby="dealer-ready" className="max-w-7xl mx-auto px-5 sm:px-8 py-14 sm:py-20 grid lg:grid-cols-[1fr_1.2fr] gap-10 lg:gap-20">
        <div><h2 id="dealer-ready" className="text-3xl font-serif font-bold">Before you apply</h2><p className="mt-4 text-zinc-600 leading-relaxed">Have your legal business name, dealer licence and licensing province, representative contact details, and the vehicle’s specifications and location ready.</p><p className="mt-4 text-zinc-600 leading-relaxed">Photos and supporting documents are added after a private draft is assigned. You can save draft content, return to it, and respond to curator revision requests before publication.</p></div>
        <div><h2 className="text-3xl font-serif font-bold mb-6">Common questions</h2><div className="divide-y divide-zinc-200 border-y border-zinc-200">{questions.map(([question, answer]) => <details key={question} className="py-5"><summary className="font-semibold cursor-pointer pr-3 focus-visible:outline-2 focus-visible:outline-amber-500">{question}</summary><p className="mt-3 text-sm text-zinc-600 leading-relaxed">{answer}</p></details>)}</div></div>
      </section>
      <section className="bg-[#121619] text-white"><div className="max-w-7xl mx-auto px-5 sm:px-8 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"><div><h2 className="text-3xl font-serif font-bold">Have the right vehicle in stock?</h2><p className="text-zinc-300 mt-3">Start with your dealership details and one vehicle you own.</p></div><button type="button" onClick={openApplication} className={applyClass}>Apply as a dealer <ArrowRight className="w-4 h-4" aria-hidden="true" /></button></div></section>
    </main>
    <footer className="bg-[#121619] border-t border-white/10 text-zinc-400"><div className="max-w-7xl mx-auto px-5 sm:px-8 py-7 flex flex-wrap justify-between gap-5 text-xs"><p>© {new Date().getFullYear()} WAILTAIL · Canadian collector vehicle auctions</p><div className="flex gap-5"><button type="button" className="underline underline-offset-4" onClick={() => setLegalTab('terms')}>Terms of Service</button><button type="button" className="underline underline-offset-4" onClick={() => setLegalTab('privacy')}>Privacy Policy</button></div></div></footer>
    {applicationOpen && <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Dealer vehicle application"><ConsignmentModal isOpen onClose={() => setApplicationOpen(false)} initialApplicantType="dealer" onOpenLegalModal={setLegalTab} onOpenHowItWorks={tab => setGuideTab(tab ?? 'selling')} /></div>}
    <LegalModal isOpen={legalTab !== null} onClose={() => setLegalTab(null)} initialTab={legalTab ?? 'terms'} />
    <HowItWorksModal isOpen={guideTab !== null} onClose={() => setGuideTab(null)} initialTab={guideTab ?? 'selling'} />
  </div>;
};
