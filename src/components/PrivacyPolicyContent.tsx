import React from 'react';
import policy from '../content/privacyPolicy.json';

export const PrivacyPolicyContent: React.FC = () => <article className="space-y-6 text-zinc-300">
  <h2 className="text-lg font-bold text-white">{policy.title}</h2>
  <p className="text-xs text-zinc-400">Last updated: {policy.updated}</p>
  <p>{policy.introduction}</p>
  {policy.sections.map(section => <section className="space-y-2" key={section.title}>
    <h3 className="text-base font-bold text-white">{section.title}</h3>
    {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
  </section>)}
  <a href={`mailto:${policy.contactEmail}`} className="inline-block underline underline-offset-4 text-emerald-300">Contact Wailtail about privacy</a>
  <p><a href="/privacy-policy/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Open the full privacy policy in a new tab</a></p>
</article>;
