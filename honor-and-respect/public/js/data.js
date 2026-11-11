// Sample register entries (fictional) in the Firestore schema used by the app.
import { CEMETERIES } from './cemeteries.js';
export { CEMETERIES };
const BR_INS = { 'U.S. Army': 'US ARMY', 'U.S. Navy': 'US NAVY', 'U.S. Marine Corps': 'USMC', 'U.S. Air Force': 'US AIR FORCE', 'U.S. Army Air Forces': 'US AAF' };

function r(id, given, middle, surname, rank, rankAbbr, branch, unit, birthDate, deathDate, birthplace, enteredFrom, conflict, cemeteryKey, loc, serviceNumber, status, awards, extra = {}) {
  const birthYear = Number((birthDate.match(/\d{4}/) || [])[0]) || null;
  const deathYear = Number((deathDate.match(/\d{4}/) || [])[0]) || null;
  const nm = [given, middle, surname].filter(Boolean).join(' ');
  const isN = cemeteryKey === 'normandy';
  const location = isN ? `Plot ${loc[0]} · Row ${loc[1]} · Grave ${loc[2]}` : `Section ${loc[0]} · Site ${loc[1]}`;
  const up = s => s.toUpperCase().replace(/[.,]/g, '');
  const inscription = extra.inscription || (isN
    ? [up(nm), `${rankAbbr} ${BR_INS[branch] || ''}`.trim(), up(enteredFrom), up(deathDate)]
    : [up(nm), `${rankAbbr} ${BR_INS[branch] || ''}`.trim(), up(conflict), `${up(birthDate)}`, `${up(deathDate)}`]);
  const [lat, lng] = CEMETERIES[cemeteryKey].geo;
  const jitter = (id.length * 7 % 13) / 10000;
  const record = !surname ? { source: '', externalId: '', url: '', status: 'none' }
    : !isN ? { source: 'ANC Explorer · Interment record', externalId: id, url: 'https://ancexplorer.army.mil/', status: 'linked' }
    : { source: 'NARA · WWII Army Enlistment Records (AAD)', externalId: serviceNumber, url: 'https://aad.archives.gov/aad/', status: extra.linked ? 'linked' : 'possible' };
  return {
    id, fullName: nm || 'Unknown soldier', givenName: given, middleName: middle, surname,
    rank, rankAbbr, branch, unit, serviceNumber, birthDate, birthYear, deathDate, deathYear, birthplace, enteredFrom, conflict,
    cemetery: CEMETERIES[cemeteryKey].name, cemeteryKey, section: loc[0], row: isN ? loc[1] : '', site: isN ? loc[2] : loc[1], location,
    geo: { lat: lat + jitter, lng: lng - jitter }, inscription, emblem: 'Latin cross', awards,
    biography: extra.biography || BIOS[id] || '', sources: extra.sources || [isN ? 'American Battle Monuments Commission, Burial Registry.' : 'Arlington National Cemetery, ANC Explorer interment record.', 'Headstone transcription, Honor and Respect scan.'],
    photoUrl: '', mediaUrls: [], record, status, sample: true
  };
}

// Short sample biographies (fictional people, set against real unit histories)
const BIOS = {
  "ANC-21-412": "Eleanor Mae Price trained as a nurse in Dayton, Ohio, and was commissioned in the Army Nurse Corps in 1942. She served with an evacuation hospital in the Mediterranean theater, where nurses worked in tented wards close behind the front lines.\n\nAfter the war she continued nursing at veterans’ hospitals in Ohio until her retirement.",
  "ANC-12-3307": "James Robert Whitfield grew up in Macon, Georgia, and enlisted in the Marine Corps at eighteen. He served as a rifleman with the 7th Marines, part of the 1st Marine Division, in the spring of 1951, as United Nations forces fought to hold central Korea against a major Chinese offensive.\n\nHe was killed in action in April 1951 and was returned home for burial at Arlington.",
  "ANC-30-1964": "Thomas Anthony Delgado was raised in San Antonio, Texas, and was drafted in 1966. He served with the 2nd Battalion, 503rd Infantry, 173rd Airborne Brigade, which fought in the Central Highlands of Vietnam around Dak To in November 1967.\n\nHe was killed in action on November 19, 1967, during the fighting for Hill 875.",
  "NAC-F-3-9": "Harold Bernard Lindqvist worked on the ore docks in Duluth, Minnesota, before enlisting in 1942. As a combat engineer with the 1st Infantry Division, he landed at Omaha Beach on D-Day, where engineers cleared beach obstacles and minefields under fire to open exits off the beach.\n\nHe died of his wounds the following day.",
  "NAC-B-20-4": "Raymond Charles Ortiz studied engineering in Tucson, Arizona, before joining the Army Air Forces as a pilot. He flew B-17 Flying Fortress missions over occupied Europe with the 390th Bomb Group, based at Framlingham, England.\n\nHis aircraft was lost over France in August 1944, during the bombing campaign that supported the Allied breakout from Normandy.",
  "ANC-18-907": "Samuel King Brooks was born in Columbia, South Carolina, and was drafted in 1917. He served with the 371st Infantry, an African American regiment of the 93rd Division that fought under French command.\n\nHe was killed in late September 1918 during the Allied offensive in the Champagne region.",
  "ANC-54-2210": "Margaret Louise Chen earned a degree in electrical engineering in California and was commissioned in the Air Force in 1956. She spent most of her career in research and acquisition with Air Force Systems Command, working on satellite and communications programs during the Cold War.\n\nShe retired as a colonel.",
  "ANC-60-8841": "Daniel Paul Kowalski grew up in Scranton, Pennsylvania, and enlisted in the Army after high school. A staff sergeant and squad leader with the 1st Battalion, 26th Infantry, he served in Baghdad during the 2007 troop surge.\n\nHe was killed in action in March 2007 and is buried in Section 60, where many of those who died in Iraq and Afghanistan rest.",
  "NAC-C-8-31": "This grave holds an American service member whose remains could not be identified after the war. The Normandy American Cemetery contains more than 300 such graves, each marked with the same inscription for the unknown dead.\n\nThe Defense POW/MIA Accounting Agency continues to identify some of them through DNA and records research.",
  "ANC-34-1207": "Walter Allen Haskins grew up in Lynchburg, Virginia, and enlisted in the Marine Corps in 1948. He served with the 5th Marines, which landed at Inchon in September 1950 and fought to recapture Seoul.\n\nHe was killed in the street fighting for the city in late September 1950.",
  "ANC-12-5518": "William James Hoskins worked in an Akron, Ohio, tire plant before he was drafted in 1943. He joined the 16th Infantry Regiment of the 1st Infantry Division as a replacement after Normandy and fought across France and into Germany.\n\nHe died in February 1945 during the advance toward the Rhine, and was later returned home for burial at Arlington.",
  "NAC-A-2-17": "Louis Edward Fontaine grew up in New Orleans and joined the Navy after college. He commanded a landing craft in the assault on Omaha Beach, carrying tanks and engineers ashore in the first waves on June 6, 1944.\n\nHe was killed when his craft was hit near the shore.",
  "ANC-59-640": "Grace Ann Whitmore trained as a nurse in Hartford, Connecticut, and joined the Navy Nurse Corps in 1954. During the Vietnam War she cared for wounded service members evacuated to the Naval Hospital in Bethesda, Maryland.\n\nShe retired as a lieutenant commander and later volunteered with veterans’ organizations."
};

export const SAMPLE = [
  r('NAC-D-14-22', 'Walter', 'J.', 'Haskins', 'Sergeant', 'SGT', 'U.S. Army', 'Co. A, 116th Infantry, 29th Infantry Division', 'March 3, 1921', 'June 6, 1944', 'Bedford, Virginia', 'Virginia', 'World War II', 'normandy', ['D', '14', '22'], '20365118', 'verified', ['Purple Heart', 'Combat Infantryman Badge', 'European–African–Middle Eastern Campaign Medal'], {
    linked: true,
    inscription: ['WALTER J HASKINS', 'SGT 116 INF 29 DIV', 'VIRGINIA', 'JUNE 6 1944'],
    biography: 'Walter James Haskins was born on a farm outside Bedford, Virginia, the third of five children. He left school after two years of high school to work the farm and joined the Virginia National Guard’s 116th Infantry in 1940, the year before the regiment was federalized.\n\nHe landed with Company A in the first wave at Omaha Beach on the morning of 6 June 1944 and was killed in action that day. His family chose for him to remain in France, buried beside the men he served with.',
    sources: ['American Battle Monuments Commission, Burial Registry: Normandy American Cemetery.', 'National Archives, WWII Army Enlistment Records (AAD), serial 20365118.', 'Family correspondence, private collection.']
  }),
  r('ANC-21-412', 'Eleanor', 'M.', 'Price', 'Second Lieutenant', '2LT', 'U.S. Army', 'Army Nurse Corps, 48th Evacuation Hospital', 'May 19, 1918', 'November 2, 1991', 'Dayton, Ohio', 'Ohio', 'World War II', 'arlington', ['21', '412'], 'N-731204', 'verified', ['Bronze Star', 'American Campaign Medal']),
  r('ANC-12-3307', 'James', 'R.', 'Whitfield', 'Private First Class', 'PFC', 'U.S. Marine Corps', 'Co. C, 1st Bn, 7th Marines', 'August 14, 1931', 'April 23, 1951', 'Macon, Georgia', 'Georgia', 'Korean War', 'arlington', ['12', '3307'], '1187420', 'verified', ['Purple Heart', 'Korean Service Medal']),
  r('ANC-30-1964', 'Thomas', 'A.', 'Delgado', 'Specialist 4', 'SP4', 'U.S. Army', 'Co. B, 2nd Bn, 503rd Infantry, 173rd Airborne Brigade', 'January 9, 1947', 'November 19, 1967', 'San Antonio, Texas', 'Texas', 'Vietnam War', 'arlington', ['30', '1964'], '54382116', 'needs_review', ['Silver Star', 'Purple Heart']),
  r('NAC-F-3-9', 'Harold', 'B.', 'Lindqvist', 'Technician Fifth Grade', 'T/5', 'U.S. Army', '1st Engineer Combat Bn, 1st Infantry Division', 'October 30, 1919', 'June 7, 1944', 'Duluth, Minnesota', 'Minnesota', 'World War II', 'normandy', ['F', '3', '9'], '37044581', 'verified', ['Purple Heart']),
  r('NAC-B-20-4', 'Raymond', 'C.', 'Ortiz', 'Captain', 'CAPT', 'U.S. Army Air Forces', '571st Bomb Squadron, 390th Bomb Group', 'February 2, 1917', 'August 8, 1944', 'Tucson, Arizona', 'Arizona', 'World War II', 'normandy', ['B', '20', '4'], 'O-662013', 'needs_review', ['Distinguished Flying Cross', 'Air Medal', 'Purple Heart']),
  r('ANC-18-907', 'Samuel', 'K.', 'Brooks', 'Private', 'PVT', 'U.S. Army', 'Co. K, 371st Infantry, 93rd Division', 'June 1, 1896', 'September 29, 1918', 'Columbia, South Carolina', 'South Carolina', 'World War I', 'arlington', ['18', '907'], '1873205', 'needs_review', ['Purple Heart']),
  r('ANC-54-2210', 'Margaret', 'L.', 'Chen', 'Colonel', 'COL', 'U.S. Air Force', 'Air Force Systems Command', 'March 27, 1934', 'July 14, 2009', 'San Francisco, California', 'California', 'Cold War', 'arlington', ['54', '2210'], '', 'verified', ['Legion of Merit', 'Meritorious Service Medal']),
  r('ANC-60-8841', 'Daniel', 'P.', 'Kowalski', 'Staff Sergeant', 'SSG', 'U.S. Army', '1st Bn, 26th Infantry, 1st Infantry Division', 'December 5, 1979', 'March 11, 2007', 'Scranton, Pennsylvania', 'Pennsylvania', 'Iraq & Afghanistan', 'arlington', ['60', '8841'], '', 'verified', ['Bronze Star', 'Purple Heart', 'Army Commendation Medal']),
  r('NAC-C-8-31', '', '', '', 'Unknown', '', 'Unknown', '', 'Unknown', '1944', '', '', 'World War II', 'normandy', ['C', '8', '31'], '', 'unmatched', [], { inscription: ['HERE RESTS', 'IN HONORED GLORY', 'A COMRADE IN ARMS', 'KNOWN BUT TO GOD'] }),
  r('ANC-34-1207', 'Walter', 'A.', 'Haskins', 'Corporal', 'CPL', 'U.S. Marine Corps', 'Co. F, 2nd Bn, 5th Marines', 'April 11, 1929', 'September 27, 1950', 'Lynchburg, Virginia', 'Virginia', 'Korean War', 'arlington', ['34', '1207'], '1093318', 'needs_review', ['Purple Heart']),
  r('ANC-12-5518', 'William', 'J.', 'Hoskins', 'Private First Class', 'PFC', 'U.S. Army', 'Co. G, 2nd Bn, 16th Infantry, 1st Infantry Division', 'July 8, 1924', 'February 2, 1945', 'Akron, Ohio', 'Ohio', 'World War II', 'arlington', ['12', '5518'], '35617729', 'verified', ['Purple Heart', 'Bronze Star']),
  r('NAC-A-2-17', 'Louis', 'E.', 'Fontaine', 'Lieutenant (junior grade)', 'LTJG', 'U.S. Navy', 'Landing craft flotilla, Omaha Beach assault force', 'September 15, 1920', 'June 6, 1944', 'New Orleans, Louisiana', 'Louisiana', 'World War II', 'normandy', ['A', '2', '17'], 'O-301877', 'verified', ['Navy Cross', 'Purple Heart']),
  r('ANC-59-640', 'Grace', 'A.', 'Whitmore', 'Lieutenant Commander', 'LCDR', 'U.S. Navy', 'Naval Hospital Bethesda', 'May 30, 1931', 'January 18, 1998', 'Hartford, Connecticut', 'Connecticut', 'Vietnam War', 'arlington', ['59', '640'], '', 'needs_review', ['Navy Commendation Medal'])
];

export const STATUS = { verified: ['Verified', 'tag-accent'], needs_review: ['Needs review', 'tag-outline'], unmatched: ['Unmatched', 'tag-neutral'] };

export function view(m) {
  const unknown = !m.surname;
  const st = STATUS[m.status || (m.importedFrom ? 'verified' : 'needs_review')] || STATUS.needs_review;
  return {
    ...m,
    name: m.fullName || [m.givenName, m.middleName, m.surname].filter(Boolean).join(' ') || 'Unknown',
    lifespan: unknown ? (m.deathYear ? '† ' + m.deathYear : '') : `${m.birthYear || '?'} – ${m.deathYear || '?'}`,
    rankLine: unknown ? 'Identity unknown' : ([m.rank, m.branch].filter(Boolean).join(' · ') || (m.relationship ? m.relationship + ' of a veteran' : '')),
    statusLabel: st[0], statusClass: st[1]
  };
}

export const surnameKey = m => String((m && m.surname) || '').toUpperCase().replace(/[^A-Z]/g, '');

export function searchName(m) {
  return [m.fullName, m.givenName, m.middleName, m.surname, m.unit, m.serviceNumber, m.location, m.id].filter(Boolean).join(' ').toLowerCase();
}
