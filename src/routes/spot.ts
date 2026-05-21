import { Router, Request, Response } from "express";

const router = Router();

// POST /api/cma-cgm/spot-search
// Stub — returns mock data matching CMA CGM SpotOn response shape
router.post("/cma-cgm/spot-search", async (req: Request, res: Response) => {
  const { pol, pod, date } = req.body;

  if (!pol || !pod || !date) {
    res.status(400).json({ error: "pol, pod, and date are required" });
    return;
  }

  // TODO: Replace with real CMA CGM SpotOn API call
  // Will need OAuth2 client credentials flow
  const mockResponse = {
    pol: pol.toUpperCase(),
    pod: pod.toUpperCase(),
    departureDate: date,
    validTo: "2026-06-15",
    transitTime: "32 days",
    vessel: "CMA CGM MARCO POLO",
    voyage: "0FL47W1MA",
    service: "FAL1",
    equipment: [
      {
        type: "20FT",
        iso: "22G1",
        amount: 1850,
        currency: "USD",
      },
      {
        type: "40FT",
        iso: "42G1",
        amount: 2950,
        currency: "USD",
      },
      {
        type: "40HC",
        iso: "45G1",
        amount: 3100,
        currency: "USD",
      },
    ],
    surcharges: [
      { name: "Bunker Adjustment Factor (BAF)", amount: 350, currency: "USD" },
      { name: "Terminal Handling (Origin)", amount: 185, currency: "USD" },
      { name: "Terminal Handling (Destination)", amount: 250, currency: "USD" },
      { name: "Bill of Lading Fee", amount: 75, currency: "USD" },
      { name: "Low Sulphur Surcharge", amount: 85, currency: "USD" },
    ],
    included: [
      "Free time: 14 days at destination",
      "Standard liner terms (port-to-port)",
    ],
    potential: [
      "Demurrage: $180/day after free time",
      "Detention: $120/day after free time",
      "IMO DG surcharge: $450 (if applicable)",
    ],
  };

  res.json(mockResponse);
});

// POST /api/cma-cgm/booking
// Stub — accepts booking form payload
router.post("/cma-cgm/booking", async (req: Request, res: Response) => {
  const {
    pol, pod, equipment, departureDate,
    shipper, consignee, commodity, cargoDescription,
    contactEmail, references,
  } = req.body;

  if (!pol || !pod || !equipment || !shipper || !consignee) {
    res.status(400).json({ error: "Missing required booking fields" });
    return;
  }

  // TODO: Replace with real CMA CGM Booking API call
  const mockBookingConfirmation = {
    bookingRef: `CMACGM-${Date.now().toString(36).toUpperCase()}`,
    status: "confirmed",
    pol,
    pod,
    equipment,
    departureDate,
    shipper,
    consignee,
    commodity,
    cargoDescription,
    contactEmail,
    references,
    message: "Booking confirmed. You will receive a confirmation email shortly.",
  };

  res.json(mockBookingConfirmation);
});

export { router as spotRouter };
