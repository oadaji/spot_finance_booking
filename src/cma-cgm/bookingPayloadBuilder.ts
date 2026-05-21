/**
 * CMA CGM Booking Payload Builder
 * Pure function — no network calls. Takes form data + spot offer, outputs API payload.
 * Phase 1: Standard dry cargo (Case 1) only.
 * Phase 2 stubs: reefer, hazardous, VAS, SOC, carrier haulage.
 */

export interface BookingPartyInput {
  name: string;
  address1: string;
  address2?: string;
  address3?: string;
  zipCode?: string;
  stateOrProvince?: string;
  city: string;
  country: string;
  contactName: string;
  contactEmail: string;
  customerCode?: string; // CMA CGM partner code, null for walk-in
}

export interface CargoInput {
  equipmentIsoCode: string;  // 22G1, 42G1, 45G1
  equipmentQuantity: number;
  commodityCode: string;     // HS code, 4-6 digits
  commodityDescription: string;
  weight: number;
  weightUOM: "KGM" | "LBS";
  volume: number;
  volumeUOM: "MTQ";
  // Phase 2 fields (stubs)
  shipperOwnedContainer?: boolean;
  reeferRequirement?: any;
  hazardous?: boolean;
  cargoItems?: any[];
  cargoLevelVas?: any[];
}

export interface SpotOfferData {
  offerId: string;
  polCode: string;
  polName?: string;
  podCode: string;
  podName?: string;
  agreementReference?: string;
  shippingCompany?: string;
  legs: {
    legNumber: number;
    from?: string;
    fromCode?: string;
    to?: string;
    toCode?: string;
    vessel?: string;
    vesselRef?: string;
    vesselRefType?: string;
    voyage?: string;
    service?: string;
    departure?: string;
    arrival?: string;
    callIdFrom?: string;
    callIdTo?: string;
  }[];
}

export interface BookingFormInput {
  customerReference?: string;
  freightPaymentMode: "Collect" | "Prepaid";
  bookingRemarks?: string;
  shipper: BookingPartyInput;
  consignee: BookingPartyInput;
  notifyParty?: BookingPartyInput;
  cargos: CargoInput[];
  // Phase 2
  blLevelVas?: string[];
}

function buildParty(input: BookingPartyInput, role: string, isBookingParty: boolean) {
  return {
    code: input.customerCode || null,
    bookingParty: isBookingParty,
    role,
    name: input.name,
    address: {
      address1: input.address1,
      address2: input.address2 || "",
      address3: input.address3 || "",
      zipCode: input.zipCode || "",
      stateOrProvince: input.stateOrProvince || "",
      city: input.city,
      country: input.country,
    },
    contact: {
      name: input.contactName,
      emailAddress: input.contactEmail,
    },
  };
}

function buildJourneyLegs(offer: SpotOfferData) {
  if (offer.legs.length === 0) {
    // Fallback: single leg from POL to POD
    return [{
      legSequence: 1,
      pointFrom: {
        location: { name: offer.polName || offer.polCode, internalCode: offer.polCode },
        departureDateLocal: new Date().toISOString(),
      },
      pointTo: {
        location: { name: offer.podName || offer.podCode, internalCode: offer.podCode },
        arrivalDateLocal: new Date().toISOString(),
      },
      transportation: {
        meanOfTransport: "Vessel",
        vehicule: { vehiculeType: "Vessel", vehiculeName: "TBN", reference: "", referenceType: "IMO" },
        voyage: { voyageReference: "", service: { code: "" } },
      },
    }];
  }

  return offer.legs.map((leg) => ({
    legSequence: leg.legNumber,
    pointFrom: {
      location: {
        name: leg.from || offer.polCode,
        internalCode: leg.fromCode || offer.polCode,
      },
      ...(leg.callIdFrom ? { callId: leg.callIdFrom } : {}),
      departureDateLocal: leg.departure || new Date().toISOString(),
    },
    pointTo: {
      location: {
        name: leg.to || offer.podCode,
        internalCode: leg.toCode || offer.podCode,
      },
      ...(leg.callIdTo ? { callId: leg.callIdTo } : {}),
      arrivalDateLocal: leg.arrival || new Date().toISOString(),
    },
    transportation: {
      meanOfTransport: "Vessel",
      vehicule: {
        vehiculeType: "Vessel",
        vehiculeName: leg.vessel || "TBN",
        reference: leg.vesselRef || "",
        referenceType: leg.vesselRefType || "IMO",
      },
      voyage: {
        voyageReference: leg.voyage || "",
        service: { code: leg.service || "" },
      },
    },
  }));
}

function buildCargo(cargo: CargoInput) {
  const base: any = {
    equipmentIsoCode: cargo.equipmentIsoCode,
    equipmentQuantity: cargo.equipmentQuantity,
    commodityCode: cargo.commodityCode,
    commodityDescription: cargo.commodityDescription,
    weight: cargo.weight,
    weightUOM: cargo.weightUOM,
    volume: cargo.volume,
    volumeUOM: cargo.volumeUOM,
  };

  // Phase 2: SOC
  if (cargo.shipperOwnedContainer) {
    base.shipperOwnedContainer = "true";
  }

  // Phase 2: Reefer
  if (cargo.reeferRequirement) {
    base.reeferRequirement = cargo.reeferRequirement;
  }

  // Phase 2: Hazardous
  if (cargo.hazardous) {
    base.hazardous = true;
    if (cargo.cargoItems) {
      base.cargoItems = cargo.cargoItems;
    }
  }

  // Phase 2: Cargo-level VAS
  if (cargo.cargoLevelVas && cargo.cargoLevelVas.length > 0) {
    base.cargoLevelVas = cargo.cargoLevelVas;
  }

  return base;
}

/**
 * Map frontend equipment type (20GP, 40GP, 40HC) to booking ISO code (22G1, 42G1, 45G1)
 */
export function equipIsoToBookingIso(iso: string): string {
  const map: Record<string, string> = {
    "20GP": "22G1",
    "40GP": "42G1",
    "40HC": "45G1",
    "20RE": "22R1",
    "40RH": "42R1",
  };
  return map[iso] || iso;
}

export function buildBookingPayload(form: BookingFormInput, offer: SpotOfferData): any {
  const parties = [
    buildParty(form.shipper, "SHP", true),
    buildParty(form.consignee, "CEE", false),
  ];

  if (form.notifyParty) {
    parties.push(buildParty(form.notifyParty, "NOT", false));
  }

  const payload: any = {
    electronicCustomerReference: form.customerReference || `ONEPORT-${Date.now().toString(36).toUpperCase()}`,
    shippingCompany: offer.shippingCompany || "0001",
    agreementReference: offer.agreementReference || "",
    portOfLoading: { internalCode: offer.polCode },
    portOfDischarge: { internalCode: offer.podCode },
    freightPaymentMode: form.freightPaymentMode,
    journeyLegs: buildJourneyLegs(offer),
    parties,
    bookingRemarks: form.bookingRemarks || "",
    cargos: form.cargos.map(buildCargo),
  };

  // Phase 2: BL-level VAS
  if (form.blLevelVas && form.blLevelVas.length > 0) {
    payload.blLevelVas = form.blLevelVas;
  }

  return payload;
}
