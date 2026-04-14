export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: number;
  transcript: string;
  summary: string;
  audioUrl: string | null;
  participants: string[];
  actionItems: string[];
}

export const MOCK_MEETINGS: Meeting[] = [
  {
    id: "mtg-001",
    title: "Staff Weekly Sync",
    date: "2026-03-28T09:00:00Z",
    duration: 1500,
    audioUrl: null,
    participants: ["Hans Gruber (GM)", "Petra Schwarz (Front Office)", "Yusuf Demir (Housekeeping)"],
    transcript: `Hans: Good morning everyone. Let's start with occupancy — Petra, how does this week look?

Petra: We're at 84% for the week, which is up from 78% last week. The corporate group from Siemens is arriving Monday and that fills most of the third floor through Thursday. Weekend is fully booked thanks to the spring festival in town.

Hans: Excellent. Yusuf, how's the team handling the turnover?

Yusuf: We're in good shape. I brought in two extra staff for the weekend shift. The new cleaning protocol is working well — room turnaround is down to 28 minutes on average from 35. One issue though: we're running low on the premium bath amenities. I've placed an order but it won't arrive until Wednesday.

Petra: I can move the VIP guests to rooms that are already stocked and hold the restocked rooms for mid-week arrivals. That should cover us.

Hans: Perfect, good coordination. One more thing — the garden terrace furniture arrived yesterday. I want it set up by Friday for the weekend brunch launch. Yusuf, can your team handle that Thursday afternoon?

Yusuf: Absolutely. I'll schedule three people for the setup after the checkout rush.`,
    summary: "Occupancy is at 84% this week, up from 78%. The Siemens corporate group arrives Monday. Room turnaround improved to 28 minutes. Premium amenities shortage being managed by strategic room assignment. New terrace furniture to be set up Thursday for the weekend brunch launch.",
    actionItems: [
      "Petra to reassign VIP guests to pre-stocked rooms to cover amenity shortage",
      "Yusuf to schedule terrace furniture setup for Thursday afternoon with 3 staff",
      "Hans to confirm brunch menu with kitchen by Wednesday",
      "Yusuf to follow up on amenity delivery status Tuesday morning",
    ],
  },
  {
    id: "mtg-002",
    title: "Supplier Negotiation — Wine",
    date: "2026-03-26T14:00:00Z",
    duration: 2400,
    audioUrl: null,
    participants: ["Hans Gruber (GM)", "Roberto Conti (Conti Wines)"],
    transcript: `Hans: Roberto, thank you for coming in. We've been happy with the Conti wines on our list, but I'd like to discuss volume pricing for the summer season.

Roberto: Of course, Hans. What are you projecting for summer?

Hans: Based on last year plus our growth, we're looking at roughly 400 bottles per month across the restaurant and events. The terrace alone will drive an extra 80–100 bottles on weekends. I'd like to focus on three wines: the Pinot Grigio, the Montepulciano, and your Prosecco for events.

Roberto: For that volume I can offer a tiered discount. At 400 bottles monthly: Pinot Grigio drops from €8.50 to €6.80 per bottle, the Montepulciano from €11 to €9.20, and Prosecco from €9 to €7.40. That's a 20% reduction across the board.

Hans: That's a good starting point. What about exclusivity? If we make Conti our primary wine partner for summer and feature your wines on the menu with tasting notes, could you go further?

Roberto: For exclusivity and menu featuring, I can add a further 5% and throw in a complimentary wine tasting event for up to 40 guests — we'll supply the wine and a sommelier. I'd also provide branded table cards and glassware at no charge.

Hans: That's attractive. Let me run the numbers with our F&B manager and get back to you by Friday. I think we can make this work.`,
    summary: "Negotiated volume pricing with Conti Wines for summer season. Targeting 400 bottles/month. Offered 20% discount on three key wines (Pinot Grigio €6.80, Montepulciano €9.20, Prosecco €7.40). Exclusivity deal adds 5% further discount plus complimentary tasting event, branded materials, and sommelier service.",
    actionItems: [
      "Hans to review financials with F&B manager by Thursday",
      "Confirm exclusivity decision with Roberto by Friday",
      "Draft updated wine list for summer terrace menu",
      "Schedule wine tasting event for late April if deal confirmed",
    ],
  },
  {
    id: "mtg-003",
    title: "Marketing Strategy Q2",
    date: "2026-03-24T11:00:00Z",
    duration: 2100,
    audioUrl: null,
    participants: ["Hans Gruber (GM)", "Sophie Klein (Marketing)", "Lena Braun (Revenue Mgr)", "Max Richter (Digital)"],
    transcript: `Sophie: Let's look at Q1 results first. Our Instagram grew 23% to 12,400 followers. The "Winter at the Lake" campaign drove 340 direct bookings, which was above target. Google Ads returned 4.2x ROAS.

Lena: From a revenue perspective, Q1 was strong at €892,000 — 8% above forecast. ADR climbed to €245 from €228. But I'm concerned about the mid-week gap. Tuesday and Wednesday occupancy averaged only 61%.

Hans: That mid-week gap is our biggest opportunity. Sophie, what are your Q2 ideas?

Sophie: Three campaigns. First, a "Midweek Escape" package — two nights Tuesday–Thursday with a spa credit and dinner included, priced at €399. Second, we push the terrace brunch launch hard on social with influencer partnerships. Third, a corporate retreat microsite targeting Munich and Stuttgart companies.

Max: On the digital side, I want to launch retargeting campaigns for website visitors who viewed rooms but didn't book. We're losing about 78% at the booking page. I also recommend a WhatsApp booking channel — our competitors are seeing 15–20% conversion rates through direct messaging.

Hans: I like all of it. Sophie, budget the midweek campaign at €3,000 for April. Max, get me a proposal for the WhatsApp integration by next Monday. Lena, model the revenue impact if we can push midweek occupancy to 75%.`,
    summary: "Q1 delivered €892K revenue, 8% above forecast. Instagram grew 23%, with 340 bookings from the winter campaign. Key challenge: midweek occupancy at 61%. Q2 strategy focuses on three campaigns: Midweek Escape package (€399), terrace brunch social launch with influencers, and corporate retreat microsite. Digital priorities: booking page retargeting and WhatsApp booking channel.",
    actionItems: [
      "Sophie to finalise Midweek Escape package creative and launch by April 7",
      "Max to submit WhatsApp integration proposal by Monday March 30",
      "Lena to model revenue impact of 75% midweek occupancy target",
      "Sophie to contact 5 regional influencers for terrace brunch launch",
      "Max to set up booking page retargeting by April 1",
    ],
  },
  {
    id: "mtg-004",
    title: "Kitchen Renovation Planning",
    date: "2026-03-22T10:00:00Z",
    duration: 3000,
    audioUrl: null,
    participants: ["Hans Gruber (GM)", "Jonas Keller (Head Chef)", "Frank Bauer (Contractor)"],
    transcript: `Hans: Frank, thanks for the site inspection yesterday. What's your assessment?

Frank: The kitchen is functional but showing its age. The ventilation system is 12 years old and running at about 60% efficiency — that's driving up your energy costs and affecting air quality. The main cooking line needs reorganisation: right now your chefs are walking too far between stations, which is slowing service during peak hours.

Jonas: I agree with that completely. On a busy Saturday I estimate we lose 8–10 minutes per table just from inefficient movement. If we could reconfigure to a proper brigade-style linear flow, we'd cut that significantly. I'd also like a dedicated pastry corner — right now desserts compete with hot prep for counter space.

Frank: Here's what I'm proposing in three phases. Phase one: new ventilation and extraction system, €28,000, takes two weeks. Phase two: cooking line reconfiguration with new equipment, €45,000, three weeks. Phase three: pastry station and cold storage expansion, €18,000, one week. Total: €91,000 over six weeks.

Hans: Can we do this without fully closing the restaurant?

Frank: Yes. We work phase by phase, closing only the section under renovation. You'd operate at about 70% capacity during phases one and two. Phase three won't affect the main kitchen at all.

Jonas: If we start in early May, we'd be running at full capacity before the summer peak in mid-June. That's our busiest period — we can't afford disruptions then.

Hans: Frank, send me the detailed quote by Monday. Jonas, work with Lena on a temporary menu that works with reduced capacity. I'll present the investment to the ownership board next week.`,
    summary: "Kitchen renovation scoped at €91,000 across three phases over six weeks: ventilation (€28K, 2 weeks), cooking line reconfiguration (€45K, 3 weeks), and pastry station expansion (€18K, 1 week). Restaurant can operate at ~70% during construction. Target start: early May to finish before summer peak. Current kitchen inefficiency costs 8–10 minutes per table on busy nights.",
    actionItems: [
      "Frank to deliver detailed renovation quote by Monday March 30",
      "Jonas to develop temporary reduced-capacity menu with Lena",
      "Hans to prepare investment proposal for ownership board presentation",
      "Jonas to list priority equipment for the new cooking line",
      "Frank to confirm earliest available start date in May",
    ],
  },
];
