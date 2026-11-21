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
  ["Firebase (IndexedDB)", "keeps you signed in and keeps a copy of your watch list on this device so the app opens quickly; removed when you sign out"],
  ["prize-seen", "the day each product was last opened on this device, so the app tells the price job at most once a day that you still watch it"],
  ["prize-demo", "only in the demo: the example watch list, kept in this browser and never uploaded"],
];

const contact = () => { const o = OPERATOR; return `${o.name}, ${o.street}, ${o.city}, ${o.country}, ${o.email}`; };

export function imprint() {
  const o = OPERATOR;
  return { title: "Imprint", sections: [
    { h: "Operator", p: ["Information under § 5 ECG and disclosure under § 25 MedienG (Impressum / Offenlegung)", [o.name, o.street, `${o.city}, ${o.country}`, `Email: ${o.email}`].join("\n")] },
    { h: "Purpose", p: ["prize is a personal, non-commercial project of mine. There are no ads, no affiliate links and no paid features."] },
    { h: "Editorial line", p: ["A private tool to follow the lowest Geizhals price of products you want to buy, with a simple estimate of whether the current price is a good one."] },
    { h: "No advice", p: ["The \"Buy now / Fair / Wait\" labels are a rough rule of thumb from the prices collected so far, your target price and the calendar (for example Black Friday). They are not a promise that a price will rise or fall."] },
    { h: "Liability", p: ["Prices are read once a day from public Geizhals product pages and may be outdated, incomplete or wrong; the shop's price at checkout is what counts. Operators of linked sites are responsible for their content."] },
  ] };
}

export function privacy() {
  return { title: "Privacy policy", sections: [
    { h: "Controller", p: [contact()] },
    { h: "In short", p: ["prize stores only what it needs to show your watch list. No tracking, no analytics, no ads, and no selling of data."] },
    { h: "What data we process", p: [
      "Account: when you sign in with Google, we receive your name, email address, profile picture and a technical user ID from Google.",
      "Watch list: for each product, its Geizhals link and article number, the name you gave it, your target price and the day you added it. Only you can read it.",
      "Public price list: so the daily price job knows what to fetch, each watched product's Geizhals link, product name and the day it was last opened are also kept in a list that anyone can read. It contains nothing that identifies you.",
      "Prices: the daily lowest Geizhals price of watched products is stored in the public GitHub repository diemmarkus/prize.",
    ] },
    { h: "Purpose and legal basis", p: ["To provide the app you asked for (Art. 6 (1) (b) GDPR). Showing the site and keeping it secure: legitimate interest (Art. 6 (1) (f) GDPR)."] },
    { h: "Services we use", p: [
      "Firebase Authentication and Cloud Firestore (Google Ireland Ltd., Gordon House, Barrow Street, Dublin 4, Ireland): sign-in and storing your watch list. The Firebase program code is loaded from Google's servers (www.gstatic.com), and your Google profile picture is loaded from Google's servers; both send your IP address to Google.",
      "GitHub Pages (GitHub B.V., Netherlands, a subsidiary of GitHub Inc., USA): hosting the website. GitHub Actions runs the daily price job.",
      "Google and GitHub are certified under the EU-US Data Privacy Framework; transfers to the USA rely on it (Art. 45 GDPR) and on standard contractual clauses.",
      "Fonts are served from this site; no requests go to Google Fonts.",
      "Geizhals is only contacted by the daily price job, never from your browser, except when you follow a link.",
    ] },
    { h: "Storage on your device", list: STORAGE.map(([k, v]) => `${k}: ${v}`) },
    { h: "How long", p: ["Your watch list stays until you remove products or ask me to delete your account data. Entries in the public price list are no longer fetched after 30 days without being opened."] },
    { h: "Your rights", p: [`You can ask for access, correction, deletion, restriction, data portability and object to processing: write to ${OPERATOR.email}. You can also complain to the Austrian Data Protection Authority (Datenschutzbehörde, dsb.gv.at).`] },
  ] };
}
