export type EmailTag = "booking" | "inquiry" | "offer" | "complaint";
export type EmailStatus = "replied" | "pending";

export interface Email {
  id: string;
  subject: string;
  sender: string;
  senderEmail: string;
  preview: string;
  body: string;
  tag: EmailTag;
  status: EmailStatus;
  aiReply: string;
  receivedAt: string;
  isImportant: boolean;
}

export const MOCK_EMAILS: Email[] = [
  {
    id: "em-001",
    subject: "Corporate Block Booking — 12 Rooms, April 14–18",
    sender: "Thomas Richter",
    senderEmail: "t.richter@siemens-events.de",
    preview: "We would like to reserve a block of 12 rooms for our annual leadership retreat...",
    body: "Dear Hotel Management,\n\nWe would like to reserve a block of 12 rooms for our annual leadership retreat from April 14 to April 18. We require 10 Deluxe rooms and 2 Junior Suites, all with lake view if possible. We would also need a conference room for 20 people each day from 9:00 to 17:00, along with full-day catering (coffee breaks, lunch, and afternoon snacks).\n\nPlease send us a group rate proposal at your earliest convenience. Our budget is approximately €280 per room per night.\n\nBest regards,\nThomas Richter\nSiemens Corporate Events",
    tag: "booking",
    status: "pending",
    aiReply: "Dear Mr. Richter,\n\nThank you for considering our hotel for your leadership retreat. We would be delighted to accommodate your group.\n\nI can confirm availability for 10 Deluxe Lake View rooms at €265/night and 2 Junior Suites at €340/night for April 14–18. Our Panorama Conference Room seats 24 and is available for your dates at €450/day, including standard AV equipment.\n\nOur full-day catering package is €58 per person and includes two coffee breaks, a three-course lunch, and afternoon refreshments.\n\nI have attached a detailed proposal with the group rate. Shall I place a provisional hold on these rooms?\n\nWarm regards,\nHotel Seeblick Management",
    receivedAt: "2026-03-30T08:15:00Z",
    isImportant: true,
  },
  {
    id: "em-002",
    subject: "Premium Olive Oil — Seasonal Offer for Gastronomy Partners",
    sender: "Maria Ferrante",
    senderEmail: "maria@ferrante-imports.it",
    preview: "We have a limited batch of cold-pressed Sicilian olive oil available at partner pricing...",
    body: "Buongiorno,\n\nWe are pleased to offer our gastronomy partners an exclusive early-season batch of cold-pressed extra virgin olive oil from our estate in Ragusa, Sicily. This year's harvest has been exceptional, and we have a limited allocation for premium restaurants and hotels in the DACH region.\n\nPricing for partners:\n- 5L tin: €42 (retail €68)\n- 10L tin: €78 (retail €125)\n- Case of 12 × 500ml bottles (gift-ready): €96\n\nMinimum order: 20L. Free delivery for orders over €500. We can also arrange a tasting session at your property.\n\nBest regards,\nMaria Ferrante\nFerrante Fine Imports",
    tag: "offer",
    status: "pending",
    aiReply: "Dear Maria,\n\nThank you for the generous partner offer. The Sicilian cold-pressed oil sounds wonderful and would complement our restaurant's Mediterranean-inspired menu.\n\nWe would like to order 4 × 10L tins and 2 cases of the 500ml gift bottles for our guest welcome packages. That brings us to approximately €504, qualifying for free delivery.\n\nCould you also arrange a tasting session for our head chef during the first week of April? We'd love to explore additional products from your estate.\n\nBest regards,\nHotel Seeblick Management",
    receivedAt: "2026-03-30T07:42:00Z",
    isImportant: false,
  },
  {
    id: "em-003",
    subject: "Group Reservation — 30 Guests, Garden Terrace Dinner",
    sender: "Claudia Meier",
    senderEmail: "claudia.meier@bayern-kultur.de",
    preview: "We are organizing a cultural evening for 30 guests and would love to hold it at your terrace...",
    body: "Dear Team,\n\nThe Bavarian Cultural Society is planning a summer evening event on May 22 for approximately 30 guests. We envision a seated dinner on your garden terrace, starting at 19:00 with an aperitif reception, followed by a four-course dinner.\n\nWe would appreciate options for:\n- A seasonal four-course menu (including a vegetarian alternative)\n- Wine pairing suggestions\n- Live background music (do you have recommendations?)\n- A brief welcome speech area with a microphone\n\nOur budget is around €95–110 per person, excluding beverages. Please let us know your availability.\n\nKind regards,\nClaudia Meier\nBavarian Cultural Society",
    tag: "booking",
    status: "pending",
    aiReply: "Dear Ms. Meier,\n\nWhat a wonderful event concept! Our garden terrace is a perfect setting for a cultural evening and is available on May 22.\n\nI would be happy to propose the following:\n- Aperitif reception at 19:00 with Prosecco and canapés (€12/person)\n- Four-course seasonal menu at €95/person, with a vegetarian alternative for each course\n- Curated wine pairing at €38/person (optional per guest)\n- We collaborate with an excellent acoustic duo who specialise in jazz and classical — I can arrange a quote\n- Microphone and small speaker setup at no extra charge\n\nShall I send a detailed menu proposal and reserve the terrace for your date?\n\nWarm regards,\nHotel Seeblick Management",
    receivedAt: "2026-03-29T16:30:00Z",
    isImportant: true,
  },
  {
    id: "em-004",
    subject: "Re: Noise Disturbance — Room 312, March 28",
    sender: "Stefan Hoffmann",
    senderEmail: "s.hoffmann@gmail.com",
    preview: "I want to follow up on the noise issue from Saturday night. The music from the bar was...",
    body: "Dear Management,\n\nI am writing to follow up on the noise disturbance I experienced during my stay in Room 312 on Saturday night (March 28). The live music from the bar area was clearly audible in my room until well past midnight, despite the bar being two floors below.\n\nI mentioned this to the night receptionist, who was apologetic but could not resolve the situation. As a returning guest who has stayed with you five times this year, I expected a higher standard of soundproofing or at least advance notice about evening events.\n\nI would appreciate knowing what steps will be taken to prevent this in the future.\n\nRegards,\nStefan Hoffmann",
    tag: "complaint",
    status: "replied",
    aiReply: "Dear Mr. Hoffmann,\n\nThank you for bringing this to our attention, and please accept our sincere apologies for the disturbance during your stay. Your comfort is our highest priority, especially as a valued returning guest.\n\nWe are taking the following steps:\n1. Installing additional sound insulation panels in the bar ceiling this month\n2. Implementing a strict 23:00 volume reduction policy for all live events\n3. Adding event notifications to the check-in process so guests on lower floors can be offered alternative rooms\n\nAs a gesture of goodwill, we would like to offer you a complimentary upgrade to our Lake Suite on your next visit. I have added a note to your guest profile.\n\nWe truly value your loyalty and hope to welcome you back soon.\n\nWarm regards,\nHotel Seeblick Management",
    receivedAt: "2026-03-29T10:15:00Z",
    isImportant: true,
  },
  {
    id: "em-005",
    subject: "Partnership Proposal — Featured Property on BayernTravel.de",
    sender: "Anna Schuster",
    senderEmail: "partnerships@bayerntravel.de",
    preview: "We'd like to feature your hotel as a premium partner on our travel platform...",
    body: "Dear Hotel Seeblick Team,\n\nBayernTravel.de is Bavaria's fastest-growing travel booking platform, and we would love to feature your property as a Premium Partner for the upcoming summer season.\n\nOur Premium Partner package includes:\n- Featured listing on our homepage (avg. 180,000 monthly visitors)\n- Priority placement in search results for your region\n- Professional photo and video shoot at no extra cost\n- Dedicated property page with direct booking integration\n- Monthly performance analytics dashboard\n\nPartner fee: €890/month (6-month commitment) or €750/month (12-month commitment). Our current partners see an average of 35% increase in direct bookings within the first quarter.\n\nWould you be available for a 20-minute video call this week to discuss?\n\nBest regards,\nAnna Schuster\nHead of Partnerships, BayernTravel.de",
    tag: "offer",
    status: "pending",
    aiReply: "Dear Ms. Schuster,\n\nThank you for the partnership proposal. BayernTravel.de's reach is impressive, and the Premium Partner package aligns well with our growth goals for summer 2026.\n\nBefore committing, we would like to understand:\n- What is the typical booking commission structure on top of the partner fee?\n- Can we review performance data from comparable properties in the lake district?\n- Is the photo/video shoot scheduled at our convenience?\n\nI am available for a call on Wednesday or Thursday afternoon. Please send a calendar link and I will confirm.\n\nBest regards,\nHotel Seeblick Management",
    receivedAt: "2026-03-29T09:00:00Z",
    isImportant: false,
  },
  {
    id: "em-006",
    subject: "Wedding Venue Inquiry — September 2026, ~120 Guests",
    sender: "Lisa & Markus Weber",
    senderEmail: "lisa.weber92@outlook.de",
    preview: "We fell in love with your venue during our weekend stay and would love to host our wedding...",
    body: "Dear Hotel Seeblick,\n\nMy fiancé Markus and I stayed at your hotel last weekend and completely fell in love with the property, especially the lakeside garden and the grand ballroom. We are now seriously considering your venue for our wedding on September 12, 2026.\n\nWe expect approximately 120 guests and envision:\n- Outdoor ceremony in the lakeside garden (weather permitting, with indoor backup)\n- Cocktail reception on the terrace\n- Seated dinner and dancing in the grand ballroom\n- Accommodation for ~40 guests (preferably a room block rate)\n- Late-night snack buffet around midnight\n\nCould you send us your wedding package information and available dates in September? We would also love to schedule a site visit with our wedding planner.\n\nWith excitement,\nLisa & Markus Weber",
    tag: "inquiry",
    status: "pending",
    aiReply: "Dear Lisa and Markus,\n\nCongratulations on your engagement! We are thrilled that our property inspired your wedding vision — the lakeside garden in September is absolutely magical.\n\nGreat news: September 12 is currently available. Here is an overview of our wedding package:\n\n- Ceremony setup (lakeside garden + indoor backup in the Wintergarten): €1,200\n- Cocktail reception on the terrace: €28/person\n- Five-course wedding dinner in the Grand Ballroom: from €105/person\n- DJ and dance floor setup: €650\n- Late-night snack buffet: €22/person\n- Room block (40 rooms): from €195/night with a 15% group discount\n- Complimentary Bridal Suite for the wedding night\n\nI would love to arrange a personal site visit with your wedding planner. We have openings on April 5 and April 8. Shall I reserve a time for you?\n\nWarmest regards,\nHotel Seeblick Events Team",
    receivedAt: "2026-03-28T18:45:00Z",
    isImportant: true,
  },
  {
    id: "em-007",
    subject: "Re: Booking #4892 — Confirmation & Special Requests",
    sender: "Dr. Klaus Brandt",
    senderEmail: "k.brandt@charite.de",
    preview: "Thank you for the confirmation. Could you also arrange an early check-in at 12:00...",
    body: "Dear Hotel Seeblick,\n\nThank you for confirming my reservation (Booking #4892) for April 2–5. I have a few additional requests:\n\n1. Early check-in at 12:00 if possible (arriving on an early flight from Berlin)\n2. Hypoallergenic pillows and bedding\n3. A quiet room away from the elevator, preferably on the upper floors\n4. Late checkout on April 5 until 14:00\n5. Dinner reservation at your restaurant for April 2 at 19:30 for 2 persons\n\nI am also a member of your loyalty programme (Card #DE-8891). Please ensure the points are credited.\n\nThank you,\nDr. Klaus Brandt",
    tag: "booking",
    status: "replied",
    aiReply: "Dear Dr. Brandt,\n\nThank you for your message. I am happy to confirm all your requests for Booking #4892:\n\n1. Early check-in at 12:00 — confirmed, your room will be prioritised for early preparation\n2. Hypoallergenic pillows and bedding — noted and arranged\n3. Room 508 (5th floor, quiet wing, away from elevators) has been assigned\n4. Late checkout until 14:00 on April 5 — confirmed at no extra charge\n5. Dinner reservation at Restaurant Seeblick for April 2 at 19:30 (2 persons) — confirmed, window table reserved\n\nYour loyalty card #DE-8891 is linked and points will be credited automatically.\n\nWe look forward to welcoming you.\n\nWarm regards,\nHotel Seeblick Front Office",
    receivedAt: "2026-03-28T14:20:00Z",
    isImportant: false,
  },
  {
    id: "em-008",
    subject: "Seasonal Menu Collaboration — Spring/Summer 2026",
    sender: "Chef Marco Bellini",
    senderEmail: "marco@bellini-consulting.de",
    preview: "Following our conversation at the Gastronomie Messe, I'd love to discuss a spring menu...",
    body: "Dear Chef and Management,\n\nIt was a pleasure meeting you at the Gastronomie Messe in Munich last week. As discussed, I would love to collaborate on your Spring/Summer 2026 restaurant menu.\n\nBased on what I saw of your current offerings and the local produce available, I have some ideas:\n\n- A lighter, lake-inspired tasting menu (5 courses) featuring local fish and foraged herbs\n- A refreshed terrace lunch menu with Mediterranean influences\n- A signature summer cocktail programme using local botanicals\n- A weekend brunch concept to drive Sunday revenue\n\nMy consulting fee is €2,800 for a full menu development cycle (concept, testing, staff training, launch support). I have availability in the second half of April.\n\nShall we schedule a tasting day to explore directions?\n\nBest,\nChef Marco Bellini\nBellini Culinary Consulting",
    tag: "inquiry",
    status: "pending",
    aiReply: "Dear Chef Bellini,\n\nIt was wonderful meeting you at the Messe as well. Your vision aligns perfectly with the direction we want to take our restaurant this season.\n\nWe are very interested in all four concepts, particularly the lake-inspired tasting menu and the weekend brunch — both have been on our wishlist. The consulting fee is within our budget.\n\nLet us schedule a tasting day during the week of April 20. Our head chef Jonas and I would love to sit down with you to discuss ingredient sourcing from our local suppliers.\n\nCould you share a preliminary concept outline before we meet? That way we can prepare some initial ingredient samples.\n\nLooking forward to it,\nHotel Seeblick Management",
    receivedAt: "2026-03-28T11:00:00Z",
    isImportant: false,
  },
];
