// Cemeteries the app knows about. Add a cemetery by adding one entry here; the
// welcome page, the "change" pop-up, the register and the admin filters all read this list.
//
// Key: a short, stable slug. It is stored on each memorial as `cemeteryKey` and on the
// device as the selected cemetery, so never rename an existing key.
// Required: name (exact; memorials store it as `cemetery` and filters match on it),
//           short (used in list rows), country, state ('' outside the United States), place.
// Optional: operator, wars, geo [lat, lng] (fallback for walking directions),
//           plots / top / gate (schematic plot plan on the grave location page).
const ABMC = 'American Battle Monuments Commission';
const WW1 = ['World War I'], WW2 = ['World War II'];

export const CEMETERIES = {
  // ---- United States ----
  // ABMC memorials to the missing in the United States (names only, no burials)
  'east-coast-memorial': { name: 'East Coast Memorial', short: 'East Coast Memorial', country: 'United States', state: 'New York', place: 'Battery Park, New York City', operator: ABMC, wars: WW2 },
  'honolulu-memorial': { name: 'Honolulu Memorial', short: 'Honolulu Memorial', country: 'United States', state: 'Hawaii', place: 'National Memorial Cemetery of the Pacific, Honolulu', operator: ABMC, wars: ['World War II', 'Korean War', 'Vietnam War'] },
  'west-coast-memorial': { name: 'West Coast Memorial', short: 'West Coast Memorial', country: 'United States', state: 'California', place: 'The Presidio, San Francisco', operator: ABMC, wars: WW2 },
  arlington: { name: 'Arlington National Cemetery', short: 'Arlington', country: 'United States', state: 'Virginia', place: 'Arlington, Virginia', operator: 'U.S. Army', geo: [38.8783, -77.0687], plots: ['2', '12', '18', '21', '27', '30', '34', '54', '59', '60'], top: 'Memorial Amphitheater', gate: 'Welcome Center' },

  // ---- ABMC overseas cemeteries ----
  // Belgium
  ardennes: { name: 'Ardennes American Cemetery', short: 'Ardennes', country: 'Belgium', state: '', place: 'Neupré', operator: ABMC, wars: WW2 },
  'flanders-field': { name: 'Flanders Field American Cemetery', short: 'Flanders Field', country: 'Belgium', state: '', place: 'Waregem', operator: ABMC, wars: WW1 },
  'henri-chapelle': { name: 'Henri-Chapelle American Cemetery', short: 'Henri-Chapelle', country: 'Belgium', state: '', place: 'Henri-Chapelle (Welkenraedt)', operator: ABMC, wars: WW2 },
  // France
  'aisne-marne': { name: 'Aisne-Marne American Cemetery', short: 'Aisne-Marne', country: 'France', state: '', place: 'Belleau', operator: ABMC, wars: WW1 },
  brittany: { name: 'Brittany American Cemetery', short: 'Brittany', country: 'France', state: '', place: 'Saint-James (Manche), Normandy', operator: ABMC, wars: WW2, geo: [48.5180, -1.2966], plots: 'ABCDEFGHIJKLMNOP'.split(''), top: 'Memorial chapel', gate: 'Visitor Building' },
  epinal: { name: 'Epinal American Cemetery', short: 'Epinal', country: 'France', state: '', place: 'Dinozé', operator: ABMC, wars: WW2 },
  'lafayette-escadrille': { name: 'Lafayette Escadrille Memorial Cemetery', short: 'Lafayette Escadrille', country: 'France', state: '', place: 'Marnes-la-Coquette', operator: ABMC, wars: WW1 },
  lorraine: { name: 'Lorraine American Cemetery', short: 'Lorraine', country: 'France', state: '', place: 'Saint-Avold', operator: ABMC, wars: WW2 },
  'meuse-argonne': { name: 'Meuse-Argonne American Cemetery', short: 'Meuse-Argonne', country: 'France', state: '', place: 'Romagne-sous-Montfaucon', operator: ABMC, wars: WW1 },
  normandy: { name: 'Normandy American Cemetery', short: 'Normandy', country: 'France', state: '', place: 'Colleville-sur-Mer, Normandy', operator: ABMC, wars: WW2, geo: [49.3597, -0.8555], plots: 'ABCDEFGHIJ'.split(''), top: 'Memorial · Reflecting pool · Chapel', gate: 'Visitor Center path' },
  'oise-aisne': { name: 'Oise-Aisne American Cemetery', short: 'Oise-Aisne', country: 'France', state: '', place: 'Fère-en-Tardenois', operator: ABMC, wars: WW1 },
  rhone: { name: 'Rhone American Cemetery', short: 'Rhone', country: 'France', state: '', place: 'Draguignan', operator: ABMC, wars: WW2 },
  somme: { name: 'Somme American Cemetery', short: 'Somme', country: 'France', state: '', place: 'Bony', operator: ABMC, wars: WW1 },
  'st-mihiel': { name: 'St. Mihiel American Cemetery', short: 'St. Mihiel', country: 'France', state: '', place: 'Thiaucourt-Regniéville', operator: ABMC, wars: WW1 },
  suresnes: { name: 'Suresnes American Cemetery', short: 'Suresnes', country: 'France', state: '', place: 'Suresnes', operator: ABMC, wars: ['World War I', 'World War II'] },
  // Italy
  florence: { name: 'Florence American Cemetery', short: 'Florence', country: 'Italy', state: '', place: 'Impruneta', operator: ABMC, wars: WW2 },
  'sicily-rome': { name: 'Sicily-Rome American Cemetery', short: 'Sicily-Rome', country: 'Italy', state: '', place: 'Nettuno', operator: ABMC, wars: WW2 },
  // Luxembourg
  luxembourg: { name: 'Luxembourg American Cemetery', short: 'Luxembourg', country: 'Luxembourg', state: '', place: 'Hamm, Luxembourg City', operator: ABMC, wars: WW2 },
  // Mexico
  'mexico-city': { name: 'Mexico City National Cemetery', short: 'Mexico City', country: 'Mexico', state: '', place: 'Mexico City', operator: ABMC, wars: ['Mexican-American War'] },
  // Netherlands
  netherlands: { name: 'Netherlands American Cemetery', short: 'Netherlands', country: 'Netherlands', state: '', place: 'Margraten', operator: ABMC, wars: WW2 },
  // Panama
  corozal: { name: 'Corozal American Cemetery', short: 'Corozal', country: 'Panama', state: '', place: 'Panama City', operator: ABMC },
  // Philippines
  clark: { name: 'Clark Veterans Cemetery', short: 'Clark', country: 'Philippines', state: '', place: 'Mabalacat, Pampanga', operator: ABMC },
  manila: { name: 'Manila American Cemetery', short: 'Manila', country: 'Philippines', state: '', place: 'Taguig, Metro Manila', operator: ABMC, wars: WW2 },
  // Tunisia
  'north-africa': { name: 'North Africa American Cemetery', short: 'North Africa', country: 'Tunisia', state: '', place: 'Carthage', operator: ABMC, wars: WW2 },
  // United Kingdom
  brookwood: { name: 'Brookwood American Cemetery', short: 'Brookwood', country: 'United Kingdom', state: '', place: 'Brookwood, Surrey', operator: ABMC, wars: WW1 },
  cambridge: { name: 'Cambridge American Cemetery', short: 'Cambridge', country: 'United Kingdom', state: '', place: 'Madingley, Cambridge', operator: ABMC, wars: WW2 }
};

export const US = 'United States';
const byText = (a, b) => a.localeCompare(b);
const uniq = a => [...new Set(a)];
const all = () => Object.entries(CEMETERIES);

/** Countries that have at least one cemetery, alphabetical. */
export const cemCountries = () => uniq(all().map(([, c]) => c.country)).sort(byText);
/** US states that have at least one cemetery, alphabetical. */
export const cemStates = country => uniq(all().filter(([, c]) => c.country === country && c.state).map(([, c]) => c.state)).sort(byText);
/** Cemeteries in a country (and, for the United States, a state), as [key, cemetery] pairs sorted by name. */
export const cemIn = (country, state) => all().filter(([, c]) => c.country === country && (!state || c.state === state)).sort((a, b) => byText(a[1].name, b[1].name));
/** Cemetery names grouped by country, for <optgroup> filters. */
export const cemGroups = () => cemCountries().map(country => [country, cemIn(country).map(([, c]) => c.name)]);
