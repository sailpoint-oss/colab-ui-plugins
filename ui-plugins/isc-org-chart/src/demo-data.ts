import type { OrgIdentity } from "./org-nav";

const mgr = (id: string, name: string) => ({ id, name });
const ORG = "2220 Europe SE";

// Invented people, not a real org: this file ships in the plugin bundle, so it
// must not carry anyone's name, title or location. The shape is what matters —
// CEO → VPs → directors/managers → individual contributors, one manager with a
// wide row and one with a small team, echoing an HR supervisory org — since
// that is what the standalone demo exercises.
export const DEMO_IDENTITIES: OrgIdentity[] = [
  { id: "1", name: "Avery Lane", title: "Chief Executive Officer", location: "Remote (United States)", orgUnit: "0000 Executive", manager: null },
  { id: "2", name: "Rowan Fielding", title: "President, Worldwide Field Ops", location: "Remote (United States)", orgUnit: "1000 Field Ops", manager: mgr("1", "Avery Lane") },
  { id: "3", name: "Harper Quinn", title: "Chief Revenue Officer", location: "Remote (United States)", orgUnit: "1100 Revenue", manager: mgr("2", "Rowan Fielding") },
  { id: "4", name: "Emerson Clarke", title: "EVP, Worldwide Sales", location: "Remote (United States)", orgUnit: "2000 Sales", manager: mgr("3", "Harper Quinn") },
  { id: "5", name: "Marlow Hayes", title: "VP, Solution Engineering EMEA", location: "Remote (United Kingdom)", orgUnit: "2200 Europe", manager: mgr("4", "Emerson Clarke") },
  { id: "6", name: "Sasha Bright", title: "Director, Solution Engineering", location: "Remote (United Kingdom)", orgUnit: ORG, manager: mgr("5", "Marlow Hayes") },
  { id: "7", name: "Nadia Okonkwo", title: "Senior Principal Solution Consultant", location: "Remote (Germany)", orgUnit: ORG, manager: mgr("6", "Sasha Bright") },
  { id: "8", name: "Ines Moreau", title: "EMEA Technical Evaluation Specialist", location: "Remote (Spain)", orgUnit: ORG, manager: mgr("6", "Sasha Bright") },
  { id: "9", name: "Tomas Ferrero", title: "Identity Strategist", location: "Remote (Italy)", orgUnit: ORG, manager: mgr("6", "Sasha Bright") },
  { id: "10", name: "Robin Vale", title: "EMEA TES Team Lead", location: "Remote (Spain)", orgUnit: ORG, manager: mgr("6", "Sasha Bright") },
  { id: "11", name: "Elliot Marsh", title: "Principal Solution Consultant", location: "Remote (United Kingdom)", orgUnit: ORG, manager: mgr("6", "Sasha Bright") },
  { id: "12", name: "Paulo Cardoso", title: "Identity Technologist", location: "Remote (Portugal)", orgUnit: ORG, manager: mgr("6", "Sasha Bright") },
  { id: "13", name: "Femke Jansen", title: "Identity Strategist", location: "Remote (Netherlands)", orgUnit: ORG, manager: mgr("6", "Sasha Bright") },
  { id: "14", name: "Mira Santos", title: "Solution Consultant", location: "Remote (Portugal)", orgUnit: ORG, manager: mgr("10", "Robin Vale") },
  { id: "15", name: "Luca Rossi", title: "Solution Consultant", location: "Remote (Italy)", orgUnit: ORG, manager: mgr("10", "Robin Vale") },
];
