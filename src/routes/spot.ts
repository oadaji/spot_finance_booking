import { Router, Request, Response } from "express";
import { searchSpotRates, createQuotation } from "../lib/cmacgm";
import { buildBookingPayload, equipIsoToBookingIso } from "../cma-cgm/bookingPayloadBuilder";

const router = Router();

// POST /api/cma-cgm/spot-search
// Calls CMA CGM SpotOn API, transforms response for frontend
router.post("/cma-cgm/spot-search", async (req: Request, res: Response) => {
  const { pol, pod, date, commodity, equipments } = req.body;

  if (!pol || !pod) {
    res.status(400).json({ error: "pol and pod are required" });
    return;
  }

  try {
    const raw = await searchSpotRates({ pol, pod, date, commodity, equipments });

    // raw is an array of SpotOffer and/or Message objects
    const offers = Array.isArray(raw) ? raw : [raw];

    // Find first offer with a valid offerId and quoteLine
    const validOffer = offers.find(
      (o: any) => o.offerId && o.offerId !== "no-offer" && o.offerId !== "Sold-out" && o.quoteLine
    );

    if (!validOffer) {
      // Check for messages explaining why
      const messages = offers.filter((o: any) => o.code && o.description);
      if (messages.length > 0) {
        res.status(404).json({
          error: "No spot offer available",
          messages: messages.map((m: any) => m.description),
        });
        return;
      }
      res.status(404).json({ error: "No spot offer available for this route" });
      return;
    }

    const ql = validOffer.quoteLine;

    // Extract equipment rates
    const equipmentRates = (ql.spotEquipments || []).map((eq: any) => {
      const surchargeMatch = ql.surcharges?.matchingSurchargesPerEquipmentTypes?.find(
        (s: any) => s.equipmentGroupIsoCode === eq.equipmentGroupIsoCode
      );
      return {
        type: formatEquipType(eq.equipmentGroupIsoCode),
        iso: eq.equipmentGroupIsoCode,
        amount: surchargeMatch?.allInRate || surchargeMatch?.basicOceanFreightRate || 0,
        basicFreight: surchargeMatch?.basicOceanFreightRate || 0,
        currency: surchargeMatch?.currency?.code || "USD",
        available: eq.availableRate !== false,
        maxNetWeight: eq.maxNetWeight,
        surcharges: (surchargeMatch?.matchingCargoSurcharges || []).map((s: any) => ({
          name: s.charge?.name || s.charge?.code || "Unknown",
          code: s.charge?.code,
          amount: s.amount || 0,
          currency: s.chargeCurrency?.code || "USD",
          includedInFreight: s.includedInBasicFreight || false,
          paymentMethod: s.paymentMethod?.name,
        })),
      };
    });

    // BL-level surcharges
    const blSurcharges = (ql.surcharges?.matchingBlSurcharges || []).map((s: any) => ({
      name: s.charge?.name || s.charge?.code || "Unknown",
      code: s.charge?.code,
      amount: s.amount || 0,
      currency: s.chargeCurrency?.code || "USD",
      paymentMethod: s.paymentMethod?.name,
    }));

    // Surcharge comments
    const surchargeComments = (ql.surcharges?.matchingSurchargesDefinedAsComments || []).map(
      (s: any) => s.chargeDefinedAsCommentTxt || s.charge?.name
    );

    // Routing legs
    const legs = (validOffer.routingLegs || []).map((leg: any) => ({
      legNumber: leg.legNumber,
      vessel: leg.vesselName,
      voyage: leg.voyageReference,
      service: leg.service?.name || leg.service?.code,
      from: leg.legFrom?.place?.name || leg.legFrom?.place?.internalCode,
      to: leg.legTo?.place?.name || leg.legTo?.place?.internalCode,
      departure: leg.departureDate,
      arrival: leg.arrivalDate,
      portCutOff: leg.portCutOffDate,
      bookingCutOff: leg.bookingCutOffDate,
    }));

    // DDSM conditions (free days)
    const ddsmConditions = (validOffer.ddsmConditions || []).map((d: any) => ({
      type: d.tariff?.name || d.tariff?.code,
      movement: d.movementType?.name,
      equipments: (d.conditionsByEquipment || []).map((c: any) => ({
        iso: c.equipmentGroupIsoCode,
        freeDays: c.freeDays?.number,
        calcType: c.freeDays?.calculationType,
      })),
      remark: d.remark,
    }));

    // Potential fees
    const potentialFees = (validOffer.potentialFees || []).map((f: any) => f.feeType);

    // Allocation info
    const allocation = (validOffer.allocation || []).map((a: any) => ({
      equipment: a.equipmentGroupIsoCode,
      available: a.allocation,
      containersAvailable: a.nbOfContainersAvailable,
      partial: a.partialAllocation,
    }));

    const response = {
      offerId: validOffer.offerId,
      offerType: validOffer.offerType,
      pol: ql.routing?.portOfLoading?.name || pol,
      polCode: ql.routing?.portOfLoading?.internalCode || pol,
      pod: ql.routing?.portOfDischarge?.name || pod,
      podCode: ql.routing?.portOfDischarge?.internalCode || pod,
      departureDate: validOffer.departureDate,
      arrivalDate: validOffer.arrivalDate,
      validFrom: ql.validityFrom,
      validTo: ql.validityTo,
      transitTime: validOffer.transitTime ? `${validOffer.transitTime} days` : null,
      shippingCompany: ql.shippingCompany,
      commodity: ql.commodity?.name || "FAK",
      commodityCode: ql.commodity?.code || "FAK",
      equipment: equipmentRates,
      blSurcharges,
      surchargeComments,
      legs,
      ddsmConditions,
      potentialFees,
      allocation,
      commentToCustomer: ql.commentToCustomer,
      carbonFootprint: validOffer.totalCarbonFootprint,
    };

    res.json(response);
  } catch (err: any) {
    console.error("SpotOn search error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cma-cgm/quotation
// Converts a spot offer into a QSPOT quotation
router.post("/cma-cgm/quotation", async (req: Request, res: Response) => {
  const { offerId, vas } = req.body;

  if (!offerId) {
    res.status(400).json({ error: "offerId is required" });
    return;
  }

  try {
    const data = await createQuotation(offerId, vas);
    res.json(data);
  } catch (err: any) {
    console.error("Quotation creation error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cma-cgm/booking
// Builds CMA CGM booking payload from form + spot offer, sends to API
router.post("/cma-cgm/booking", async (req: Request, res: Response) => {
  const { spotOffer, form } = req.body;

  if (!spotOffer || !form) {
    res.status(400).json({ error: "spotOffer and form are required" });
    return;
  }

  if (!form.shipper?.name || !form.consignee?.name) {
    res.status(400).json({ error: "Shipper and consignee names are required" });
    return;
  }

  if (!form.cargos || form.cargos.length === 0) {
    res.status(400).json({ error: "At least one cargo entry is required" });
    return;
  }

  try {
    // Map equipment ISO codes for booking API
    const cargos = form.cargos.map((c: any) => ({
      ...c,
      equipmentIsoCode: equipIsoToBookingIso(c.equipmentIsoCode),
    }));

    const payload = buildBookingPayload({ ...form, cargos }, spotOffer);

    // TODO: POST to CMA CGM booking API when URL is confirmed
    // Env var: CMACGM_BOOKING_URL
    // Scope: likely different from instantquote — flag as TODO
    const bookingUrl = process.env.CMACGM_BOOKING_URL;

    if (bookingUrl) {
      // TODO: Wire real API call
      // const token = await getAccessToken(); // needs booking scope
      // const apiRes = await fetch(bookingUrl, { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      // return res.json(await apiRes.json());
    }

    // For now: log the payload and return confirmation with the built payload
    console.log("Booking payload:", JSON.stringify(payload, null, 2));

    res.json({
      bookingRef: `ONEPORT-${Date.now().toString(36).toUpperCase()}`,
      status: "pending",
      message: "Booking request submitted. CMA CGM booking API integration pending — payload logged to server.",
      payload,
    });
  } catch (err: any) {
    console.error("Booking error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

function formatEquipType(iso: string): string {
  if (iso === "20GP") return "20FT";
  if (iso === "40GP") return "40FT";
  if (iso === "40HC") return "40HC";
  if (iso === "20RE") return "20RF";
  if (iso === "40RH") return "40RF";
  return iso;
}

export { router as spotRouter };
