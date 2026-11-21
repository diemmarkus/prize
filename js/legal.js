// Imprint (Impressum) and privacy policy. Austrian operator: § 5 ECG, § 25 MedienG, GDPR, § 165 TKG 2021.
// Keep STORAGE and the data sections in sync with the code. This is a template, not legal advice.

export const OPERATOR = {
  name: "Markus Diem",
  street: "Leitgebgasse 7/25",
  city: "1050 Wien",
  country: "Austria",
  email: "diemmarkus@gmail.com",
};

const STORAGE = [
  ["prize-list", "your watch list and the prices you logged; stays in this browser until you remove items or clear the site's data"],
];

const contact = () => { const o = OPERATOR; return `${o.name}, ${o.street}, ${o.city}, ${o.country}, ${o.email}`; };

export function imprint() {
  const o = OPERATOR;
  return { title: "Imprint", sections: [
    { h: "Operator", p: ["Information under § 5 ECG and disclosure under § 25 MedienG (Impressum / Offenlegung)", [o.name, o.street, `${o.city}, ${o.country}`, `Email: ${o.email}`].join("\n")] },
    { h: "Purpose", p: ["prize is a personal, non-commercial project of mine. There are no ads, no affiliate links and no paid features."] },
    { h: "Editorial line", p: ["A private tool to follow the prices of products and trips you want to buy, with a simple estimate of whether the current price is a good one."] },
    { h: "No advice", p: ["The \"Buy now / Fair / Wait\" labels are a rough rule of thumb from the prices logged so far, your target price and the calendar (Black Friday, how close a trip is). They are not a promise that a price will rise or fall."] },
    { h: "Liability", p: ["Prices are the ones you log and may be outdated; the shop's price at checkout is what counts. Operators of linked sites are responsible for their content."] },
  ] };
}

export function privacy() {
  return { title: "Privacy policy", sections: [
    { h: "Controller", p: [contact()] },
    { h: "In short", p: ["prize has no accounts and no server of its own. Your watch list and prices stay in your browser. No tracking, no analytics, no ads."] },
    { h: "What data we process", p: [
      "Your watch list (names, links, travel dates, target prices and the prices you log) is stored only in this browser's local storage and never sent to us.",
      "When you open the site, GitHub Pages receives your IP address and browser details, as any web server does.",
    ] },
    { h: "Purpose and legal basis", p: ["Showing the site and keeping it secure: legitimate interest (Art. 6 (1) (f) GDPR)."] },
    { h: "Services we use", p: [
      "GitHub Pages (GitHub B.V., Netherlands, a subsidiary of GitHub Inc., USA): hosting the website. GitHub is certified under the EU-US Data Privacy Framework; transfers to the USA rely on it (Art. 45 GDPR) and on standard contractual clauses.",
      "Fonts are served from this site; no requests go to Google Fonts.",
      "Links to Geizhals or shops only open when you tap them.",
    ] },
    { h: "Storage on your device", list: STORAGE.map(([k, v]) => `${k}: ${v}`) },
    { h: "Your rights", p: [`You can ask for access, correction, deletion, restriction and object to processing: write to ${OPERATOR.email}. You can also complain to the Austrian Data Protection Authority (Datenschutzbehörde, dsb.gv.at).`] },
  ] };
}
