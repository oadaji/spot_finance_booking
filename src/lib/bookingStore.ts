import fs from "fs";
import path from "path";

export interface Cutoffs {
  vesselDeparture: string;
  docCutoff: string;
  vgmCutoff: string;
  gateInCutoff: string;
  customsCutoff: string;
  dgCutoff?: string;
}

export interface AmendmentEntry {
  timestamp: string;
  changedFields: string[];
  previousPayload: any;
}

export interface Booking {
  id: string;
  bookingReference: string;
  status: "accepted" | "pending" | "cancelled" | "amended";
  createdAt: string;
  updatedAt: string;
  quoteSnapshot: any;
  payload: any;
  cutoffs: Cutoffs;
  amendmentHistory: AmendmentEntry[];
}

const DATA_FILE = path.join(__dirname, "../../data/bookings.json");

let bookings: Booking[] = [];

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function save() {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(bookings, null, 2));
}

function load() {
  ensureDir();
  if (fs.existsSync(DATA_FILE)) {
    bookings = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  }
}

function generateRef(): string {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");
  return `CMA${digits}`;
}

function generateCutoffs(createdAt: Date, hazardous?: boolean): Cutoffs {
  const daysAhead = 14 + Math.floor(Math.random() * 8); // 14-21 days
  const departure = new Date(createdAt);
  departure.setDate(departure.getDate() + daysAhead);

  const offset = (days: number) => {
    const d = new Date(departure);
    d.setDate(d.getDate() - days);
    return d.toISOString();
  };

  const cutoffs: Cutoffs = {
    vesselDeparture: departure.toISOString(),
    docCutoff: offset(5),
    vgmCutoff: offset(2),
    gateInCutoff: offset(1),
    customsCutoff: offset(2),
  };

  if (hazardous) {
    cutoffs.dgCutoff = offset(7);
  }

  return cutoffs;
}

export function getAllBookings(): Booking[] {
  return [...bookings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getBooking(ref: string): Booking | undefined {
  return bookings.find(b => b.bookingReference === ref);
}

export function createBooking(quoteSnapshot: any, payload: any): Booking {
  const now = new Date();
  const hazardous = payload.cargos?.some((c: any) => c.hazardous);
  const booking: Booking = {
    id: crypto.randomUUID(),
    bookingReference: generateRef(),
    status: Math.random() < 0.9 ? "accepted" : "pending",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    quoteSnapshot,
    payload,
    cutoffs: generateCutoffs(now, hazardous),
    amendmentHistory: [],
  };
  bookings.push(booking);
  save();
  return booking;
}

export function amendBooking(ref: string, newPayload: any, changedFields: string[]): Booking | null {
  const booking = bookings.find(b => b.bookingReference === ref);
  if (!booking) return null;

  booking.amendmentHistory.push({
    timestamp: new Date().toISOString(),
    changedFields,
    previousPayload: { ...booking.payload },
  });
  booking.payload = newPayload;
  booking.status = "amended";
  booking.updatedAt = new Date().toISOString();
  save();
  return booking;
}

export function cancelBooking(ref: string): { success: boolean; error?: string; booking?: Booking } {
  const booking = bookings.find(b => b.bookingReference === ref);
  if (!booking) return { success: false, error: "Booking not found" };

  const departure = new Date(booking.cutoffs.vesselDeparture);
  if (departure < new Date()) {
    return { success: false, error: "Cannot cancel — vessel has departed. Contact CMA CGM ops." };
  }

  booking.amendmentHistory.push({
    timestamp: new Date().toISOString(),
    changedFields: ["status"],
    previousPayload: { status: booking.status },
  });
  booking.status = "cancelled";
  booking.updatedAt = new Date().toISOString();
  save();
  return { success: true, booking };
}

function seedBookings() {
  const now = new Date();
  const daysFromNow = (d: number) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + d);
    return dt.toISOString();
  };
  const daysAgo = (d: number) => daysFromNow(-d);

  const makeParty = (role: string, name: string, city: string, country: string, email: string) => ({
    code: null, bookingParty: role === "SHP", role,
    name,
    address: { address1: "123 Trade St", address2: "", address3: "", zipCode: "100001", stateOrProvince: "", city, country },
    contact: { name: `${name} Ops`, emailAddress: email },
  });

  const makeCargo = (iso: string, qty: number, desc: string, hs: string, wt: number) => ({
    equipmentIsoCode: iso, equipmentQuantity: qty,
    commodityCode: hs, commodityDescription: desc,
    weight: wt, weightUOM: "KGM", volume: qty * 30, volumeUOM: "MTQ",
  });

  const makeLeg = (fromName: string, fromCode: string, toName: string, toCode: string, vessel: string, voyage: string, service: string, dep: string, arr: string) => ({
    legSequence: 1,
    pointFrom: { location: { name: fromName, internalCode: fromCode }, callId: String(40000000 + Math.floor(Math.random() * 999999)), departureDateLocal: dep },
    pointTo: { location: { name: toName, internalCode: toCode }, callId: String(40000000 + Math.floor(Math.random() * 999999)), arrivalDateLocal: arr },
    transportation: { meanOfTransport: "Vessel", vehicule: { vehiculeType: "Vessel", vehiculeName: vessel, reference: "CMA" + String(Math.floor(Math.random() * 9999999)).padStart(7, "0"), referenceType: "IMO" }, voyage: { voyageReference: voyage, service: { code: service } } },
  });

  const makeCutoffs = (depDate: string, hazardous?: boolean): Cutoffs => {
    const dep = new Date(depDate);
    const off = (days: number) => { const d = new Date(dep); d.setDate(d.getDate() - days); return d.toISOString(); };
    const c: Cutoffs = { vesselDeparture: dep.toISOString(), docCutoff: off(5), vgmCutoff: off(2), gateInCutoff: off(1), customsCutoff: off(2) };
    if (hazardous) c.dgCutoff = off(7);
    return c;
  };

  const seeds: Booking[] = [
    {
      id: crypto.randomUUID(),
      bookingReference: "CMA827193046",
      status: "accepted",
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
      quoteSnapshot: { offerId: "seed-1", pol: "SHANGHAI", polCode: "CNSHA", pod: "APAPA", podCode: "NGAPP", transitTime: "35 days", validTo: daysFromNow(20), equipment: [{ type: "40HC", iso: "40HC", amount: 6046, currency: "USD" }] },
      payload: {
        electronicCustomerReference: "ONEPORT-SEED-001", shippingCompany: "0001", agreementReference: "TA-CROSS-CMA",
        portOfLoading: { internalCode: "CNSHA" }, portOfDischarge: { internalCode: "NGAPP" }, freightPaymentMode: "Prepaid",
        journeyLegs: [makeLeg("SHANGHAI", "CNSHA", "APAPA", "NGAPP", "COS TBN 20", "130130E19", "FAL1", daysFromNow(18), daysFromNow(53))],
        parties: [makeParty("SHP", "Acme Trading Co.", "Shanghai", "CN", "ops@acme-trading.example"), makeParty("CEE", "Lagos Imports Ltd.", "Lagos", "NG", "imports@lagosimports.example")],
        bookingRemarks: "", cargos: [makeCargo("45G1", 2, "mobile phone accessories", "8517.12", 18000)],
      },
      cutoffs: makeCutoffs(daysFromNow(18)),
      amendmentHistory: [],
    },
    {
      id: crypto.randomUUID(),
      bookingReference: "CMA194382716",
      status: "accepted",
      createdAt: daysAgo(5),
      updatedAt: daysAgo(5),
      quoteSnapshot: { offerId: "seed-2", pol: "LOS ANGELES", polCode: "USLAX", pod: "LE HAVRE", podCode: "FRLEH", transitTime: "22 days", validTo: daysFromNow(10), equipment: [{ type: "20FT", iso: "20GP", amount: 2800, currency: "USD" }, { type: "40FT", iso: "40GP", amount: 4200, currency: "USD" }] },
      payload: {
        electronicCustomerReference: "ONEPORT-SEED-002", shippingCompany: "0001", agreementReference: "TA-CROSS-CMA",
        portOfLoading: { internalCode: "USLAX" }, portOfDischarge: { internalCode: "FRLEH" }, freightPaymentMode: "Collect",
        journeyLegs: [makeLeg("LOS ANGELES", "USLAX", "LE HAVRE", "FRLEH", "CMA CGM BLUE", "FAL3-2605W", "FAL3", daysFromNow(7), daysFromNow(29))],
        parties: [makeParty("SHP", "Pacific Logistics Inc.", "Los Angeles", "US", "bookings@paclog.example"), makeParty("CEE", "Global Imports Ltd.", "Le Havre", "FR", "reception@globalimports.example")],
        bookingRemarks: "Cutoff approaching", cargos: [makeCargo("22G1", 1, "auto parts", "8708.99", 15000), makeCargo("42G1", 1, "machinery components", "8483.40", 22000)],
      },
      cutoffs: makeCutoffs(daysFromNow(7)),
      amendmentHistory: [],
    },
    {
      id: crypto.randomUUID(),
      bookingReference: "CMA384726195",
      status: "pending",
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
      quoteSnapshot: { offerId: "seed-3", pol: "NAVA SHEVA", polCode: "INNSA", pod: "SINGAPORE", podCode: "SGSIN", transitTime: "17 days", validTo: daysFromNow(25), equipment: [{ type: "40HC", iso: "40HC", amount: 3800, currency: "USD" }] },
      payload: {
        electronicCustomerReference: "ONEPORT-SEED-003", shippingCompany: "0001", agreementReference: "TA-CROSS-CMA",
        portOfLoading: { internalCode: "INNSA" }, portOfDischarge: { internalCode: "SGSIN" }, freightPaymentMode: "Prepaid",
        journeyLegs: [makeLeg("NAVA SHEVA", "INNSA", "SINGAPORE", "SGSIN", "APL OAKLAND", "AS6-2606E", "AS6", daysFromNow(21), daysFromNow(38))],
        parties: [makeParty("SHP", "Eastern Cargo Partners", "Mumbai", "IN", "cargo@easternpartners.example"), makeParty("CEE", "Maritime Goods SA", "Singapore", "SG", "ops@maritimegoods.example")],
        bookingRemarks: "Reefer cargo — temperature sensitive", cargos: [{ equipmentIsoCode: "45G1", equipmentQuantity: 3, commodityCode: "0303.11", commodityDescription: "frozen fish fillets", weight: 24000, weightUOM: "KGM", volume: 90, volumeUOM: "MTQ", reeferRequirement: { carriageTemperature: -18, temperatureUom: "CEL", gensetRequired: true } }],
      },
      cutoffs: makeCutoffs(daysFromNow(21)),
      amendmentHistory: [],
    },
    {
      id: crypto.randomUUID(),
      bookingReference: "CMA729384651",
      status: "accepted",
      createdAt: daysAgo(20),
      updatedAt: daysAgo(20),
      quoteSnapshot: { offerId: "seed-4", pol: "NINGBO", polCode: "CNNGB", pod: "NEW YORK", podCode: "USNYC", transitTime: "28 days", validTo: daysAgo(5), equipment: [{ type: "40FT", iso: "40GP", amount: 5200, currency: "USD" }] },
      payload: {
        electronicCustomerReference: "ONEPORT-SEED-004", shippingCompany: "0001", agreementReference: "TA-CROSS-CMA",
        portOfLoading: { internalCode: "CNNGB" }, portOfDischarge: { internalCode: "USNYC" }, freightPaymentMode: "Prepaid",
        journeyLegs: [makeLeg("NINGBO", "CNNGB", "NEW YORK", "USNYC", "CMA CGM RED", "TPX-2605W", "TPX", daysAgo(3), daysFromNow(25))],
        parties: [makeParty("SHP", "Global Imports Ltd.", "Ningbo", "CN", "export@globalimports.example"), makeParty("CEE", "Acme Trading Co.", "New York", "US", "ny@acme-trading.example")],
        bookingRemarks: "", cargos: [makeCargo("42G1", 1, "consumer electronics", "8528.72", 19000)],
      },
      cutoffs: makeCutoffs(daysAgo(3)),
      amendmentHistory: [],
    },
    {
      id: crypto.randomUUID(),
      bookingReference: "CMA192847365",
      status: "cancelled",
      createdAt: daysAgo(10),
      updatedAt: daysAgo(5),
      quoteSnapshot: { offerId: "seed-5", pol: "SHANGHAI", polCode: "CNSHA", pod: "HAMBURG", podCode: "DEHAM", transitTime: "25 days", validTo: daysAgo(2), equipment: [{ type: "20FT", iso: "20GP", amount: 2400, currency: "USD" }] },
      payload: {
        electronicCustomerReference: "ONEPORT-SEED-005", shippingCompany: "0001", agreementReference: "TA-CROSS-CMA",
        portOfLoading: { internalCode: "CNSHA" }, portOfDischarge: { internalCode: "DEHAM" }, freightPaymentMode: "Collect",
        journeyLegs: [makeLeg("SHANGHAI", "CNSHA", "HAMBURG", "DEHAM", "CMA CGM TITUS", "AEX-2605E", "AEX", daysAgo(2), daysFromNow(23))],
        parties: [makeParty("SHP", "Pacific Logistics Inc.", "Shanghai", "CN", "china@paclog.example"), makeParty("CEE", "Maritime Goods SA", "Hamburg", "DE", "de@maritimegoods.example")],
        bookingRemarks: "Cancelled — customer request", cargos: [makeCargo("22G1", 2, "textile fabrics", "5208.11", 12000)],
      },
      cutoffs: makeCutoffs(daysAgo(2)),
      amendmentHistory: [{ timestamp: daysAgo(5), changedFields: ["status"], previousPayload: { status: "accepted" } }],
    },
  ];

  bookings = seeds;
  save();
}

// Initialize
load();
if (bookings.length === 0) {
  seedBookings();
}
