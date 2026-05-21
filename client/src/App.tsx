import React, { useState } from "react";
import "./App.css";

interface EquipSurcharge {
  name: string;
  code?: string;
  amount: number;
  currency: string;
  includedInFreight?: boolean;
  paymentMethod?: string;
}

interface Equipment {
  type: string;
  iso: string;
  amount: number;
  basicFreight: number;
  currency: string;
  available: boolean;
  maxNetWeight?: number;
  surcharges: EquipSurcharge[];
}

interface BlSurcharge {
  name: string;
  amount: number;
  currency: string;
  paymentMethod?: string;
}

interface Leg {
  legNumber: number;
  vessel?: string;
  voyage?: string;
  service?: string;
  from?: string;
  fromCode?: string;
  to?: string;
  toCode?: string;
  departure?: string;
  arrival?: string;
  callIdFrom?: string;
  callIdTo?: string;
}

interface SearchResult {
  offerId: string;
  offerType?: string;
  pol: string;
  polCode: string;
  pod: string;
  podCode: string;
  departureDate?: string;
  arrivalDate?: string;
  validFrom?: string;
  validTo?: string;
  transitTime?: string;
  shippingCompany?: string;
  commodity?: string;
  commodityCode?: string;
  equipment: Equipment[];
  blSurcharges: BlSurcharge[];
  surchargeComments: string[];
  legs: Leg[];
  potentialFees: string[];
  ddsmConditions: any[];
  commentToCustomer?: string;
  carbonFootprint?: number;
}

interface PartyForm {
  name: string;
  address1: string;
  address2: string;
  address3: string;
  zipCode: string;
  stateOrProvince: string;
  city: string;
  country: string;
  contactName: string;
  contactEmail: string;
}

interface BookingConfirmation {
  bookingRef: string;
  status: string;
  message: string;
  payload?: any;
}

interface QuotationResult {
  quotationReference: string;
  webBookingUrl?: string;
}

const API = process.env.REACT_APP_API_URL || "/api";

const emptyParty = (): PartyForm => ({
  name: "", address1: "", address2: "", address3: "",
  zipCode: "", stateOrProvince: "", city: "", country: "",
  contactName: "", contactEmail: "",
});

export default function App() {
  const [pol, setPol] = useState("");
  const [pod, setPod] = useState("");
  const [date, setDate] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selectedEquip, setSelectedEquip] = useState<Equipment | null>(null);
  const [showBooking, setShowBooking] = useState(false);

  // Booking form state
  const [shipper, setShipper] = useState<PartyForm>(emptyParty());
  const [consignee, setConsignee] = useState<PartyForm>(emptyParty());
  const [showNotify, setShowNotify] = useState(false);
  const [notifyParty, setNotifyParty] = useState<PartyForm>(emptyParty());
  const [commodityDesc, setCommodityDesc] = useState("");
  const [commodityCode, setCommodityCode] = useState("");
  const [weight, setWeight] = useState("");
  const [weightUOM, setWeightUOM] = useState<"KGM" | "LBS">("KGM");
  const [volume, setVolume] = useState("");
  const [eqQty, setEqQty] = useState("1");
  const [freightPayment, setFreightPayment] = useState<"Collect" | "Prepaid">("Collect");
  const [customerRef, setCustomerRef] = useState("");
  const [bookingRemarks, setBookingRemarks] = useState("");

  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [quotation, setQuotation] = useState<QuotationResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [converting, setConverting] = useState(false);

  const search = async () => {
    if (!pol || !pod) return;
    setSearching(true);
    setError("");
    setResult(null);
    setSelectedEquip(null);
    setShowBooking(false);
    setConfirmation(null);
    setQuotation(null);
    try {
      const res = await fetch(`${API}/cma-cgm/spot-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pol: pol.toUpperCase(), pod: pod.toUpperCase(), date: date || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.messages?.join(", ") || "No rates found");
      } else {
        setResult(data);
      }
    } catch {
      setError("Search failed — check connection");
    } finally {
      setSearching(false);
    }
  };

  const selectEquipment = (eq: Equipment) => {
    setSelectedEquip(eq);
    setShowBooking(false);
    setConfirmation(null);
    setQuotation(null);
  };

  const convertToQuotation = async () => {
    if (!result?.offerId) return;
    setConverting(true);
    try {
      const res = await fetch(`${API}/cma-cgm/quotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: result.offerId }),
      });
      const data = await res.json();
      if (res.ok) {
        setQuotation(data);
        setShowBooking(true);
      } else {
        setError(data.error || "Failed to create quotation");
      }
    } catch {
      setError("Quotation creation failed");
    } finally {
      setConverting(false);
    }
  };

  const submitBooking = async () => {
    if (!shipper.name || !consignee.name || !commodityDesc || !commodityCode || !weight || !volume) {
      setError("Fill in all required booking fields");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const spotOffer = {
        offerId: result?.offerId,
        polCode: result?.polCode,
        polName: result?.pol,
        podCode: result?.podCode,
        podName: result?.pod,
        shippingCompany: result?.shippingCompany,
        agreementReference: quotation?.quotationReference || "",
        legs: (result?.legs || []).map(l => ({
          legNumber: l.legNumber,
          from: l.from,
          fromCode: l.fromCode,
          to: l.to,
          toCode: l.toCode,
          vessel: l.vessel,
          voyage: l.voyage,
          service: l.service,
          departure: l.departure,
          arrival: l.arrival,
          callIdFrom: l.callIdFrom,
          callIdTo: l.callIdTo,
        })),
      };

      const form = {
        customerReference: customerRef || undefined,
        freightPaymentMode: freightPayment,
        bookingRemarks,
        shipper,
        consignee,
        notifyParty: showNotify ? notifyParty : undefined,
        cargos: [{
          equipmentIsoCode: selectedEquip?.iso || "20GP",
          equipmentQuantity: parseInt(eqQty) || 1,
          commodityCode,
          commodityDescription: commodityDesc,
          weight: parseFloat(weight) || 0,
          weightUOM,
          volume: parseFloat(volume) || 0,
          volumeUOM: "MTQ" as const,
        }],
      };

      const res = await fetch(`${API}/cma-cgm/booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotOffer, form }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfirmation(data);
      } else {
        setError(data.error || "Booking failed");
      }
    } catch {
      setError("Booking submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const fmtDateTime = (d?: string) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  const PartyFields = ({ label, party, setParty }: { label: string; party: PartyForm; setParty: (p: PartyForm) => void }) => (
    <div className="party-block">
      <div className="detail-heading">{label}</div>
      <div className="form-grid">
        <div className="field"><input type="text" value={party.name} onChange={e => setParty({ ...party, name: e.target.value })} placeholder="Company name" /><label>name *</label></div>
        <div className="field"><input type="text" value={party.contactName} onChange={e => setParty({ ...party, contactName: e.target.value })} placeholder="Contact person" /><label>contact name</label></div>
        <div className="field"><input type="email" value={party.contactEmail} onChange={e => setParty({ ...party, contactEmail: e.target.value })} placeholder="email@company.com" /><label>email</label></div>
        <div className="field"><input type="text" value={party.country} onChange={e => setParty({ ...party, country: e.target.value })} placeholder="NG" maxLength={2} /><label>country (ISO) *</label></div>
        <div className="field span-2"><input type="text" value={party.address1} onChange={e => setParty({ ...party, address1: e.target.value })} placeholder="Street address" /><label>address line 1</label></div>
        <div className="field"><input type="text" value={party.address2} onChange={e => setParty({ ...party, address2: e.target.value })} placeholder="Suite / floor" /><label>address line 2</label></div>
        <div className="field"><input type="text" value={party.city} onChange={e => setParty({ ...party, city: e.target.value })} placeholder="City" /><label>city</label></div>
        <div className="field"><input type="text" value={party.stateOrProvince} onChange={e => setParty({ ...party, stateOrProvince: e.target.value })} placeholder="State" /><label>state</label></div>
        <div className="field"><input type="text" value={party.zipCode} onChange={e => setParty({ ...party, zipCode: e.target.value })} placeholder="Zip" /><label>zip code</label></div>
      </div>
    </div>
  );

  return (
    <div className="container">
      {/* Section 1 — Search */}
      <div className="card">
        <div className="search-row">
          <div className="field">
            <input type="text" value={pol} onChange={e => setPol(e.target.value)} placeholder="CNSHA" onKeyDown={e => e.key === "Enter" && search()} />
            <label>pol</label>
          </div>
          <div className="field">
            <input type="text" value={pod} onChange={e => setPod(e.target.value)} placeholder="NGAPP" onKeyDown={e => e.key === "Enter" && search()} />
            <label>pod</label>
          </div>
          <div className="field field-date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            <label>date</label>
          </div>
          <button className="btn" onClick={search} disabled={searching}>
            {searching ? "loading..." : "Search"}
          </button>
        </div>
      </div>

      {/* Global error */}
      {error && <div className="error-msg">{error}</div>}

      {/* Section 2 — Rate Results */}
      {result && (
        <div className="card">
          <div className="rate-header">
            <span>{result.pol} ({result.polCode}) --&gt; {result.pod} ({result.podCode})</span>
            <span>Valid to: {result.validTo || "\u2014"}</span>
          </div>
          {result.transitTime && (
            <div className="rate-meta">
              Transit: {result.transitTime}
              {result.departureDate && <> &middot; ETD: {fmtDateTime(result.departureDate)}</>}
              {result.arrivalDate && <> &middot; ETA: {fmtDateTime(result.arrivalDate)}</>}
            </div>
          )}
          <div className="equipment-row">
            {result.equipment.filter(e => e.available).map(eq => (
              <div key={eq.iso} className={`equip-tile ${selectedEquip?.iso === eq.iso ? "equip-selected" : ""}`} onClick={() => selectEquipment(eq)}>
                <div className="equip-label">{eq.type}</div>
                <div className="equip-amount">${eq.amount.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 3 — Extra Details */}
      {selectedEquip && result && (
        <div className="card">
          <div className="detail-section">
            <div className="detail-row"><span className="detail-key">selected</span><span>{selectedEquip.type} ({selectedEquip.iso})</span></div>
            <div className="detail-row"><span className="detail-key">all-in rate</span><span>${selectedEquip.amount.toLocaleString()} {selectedEquip.currency}</span></div>
            <div className="detail-row"><span className="detail-key">basic ocean freight</span><span>${selectedEquip.basicFreight.toLocaleString()} {selectedEquip.currency}</span></div>
            {result.transitTime && <div className="detail-row"><span className="detail-key">transit time</span><span>{result.transitTime}</span></div>}
            {selectedEquip.maxNetWeight && <div className="detail-row"><span className="detail-key">max net weight</span><span>{selectedEquip.maxNetWeight} tons</span></div>}
          </div>

          {result.legs.length > 0 && (
            <div className="detail-section">
              <div className="detail-heading">routing</div>
              {result.legs.map(leg => (
                <div key={leg.legNumber} className="detail-row">
                  <span>{leg.from} &rarr; {leg.to}</span>
                  <span>{leg.vessel || ""} {leg.voyage || ""}</span>
                </div>
              ))}
            </div>
          )}

          {selectedEquip.surcharges.length > 0 && (
            <div className="detail-section">
              <div className="detail-heading">surcharges ({selectedEquip.type})</div>
              {selectedEquip.surcharges.filter(s => !s.includedInFreight).map((s, i) => (
                <div key={i} className="detail-row"><span>{s.name}</span><span>${s.amount.toLocaleString()} {s.currency}</span></div>
              ))}
            </div>
          )}

          {result.blSurcharges.length > 0 && (
            <div className="detail-section">
              <div className="detail-heading">per-BL charges</div>
              {result.blSurcharges.map((s, i) => (
                <div key={i} className="detail-row"><span>{s.name}</span><span>${s.amount.toLocaleString()} {s.currency}</span></div>
              ))}
            </div>
          )}

          {result.ddsmConditions.length > 0 && (
            <div className="detail-section">
              <div className="detail-heading">free time</div>
              {result.ddsmConditions.map((d, i) => (
                <div key={i} className="detail-row">
                  <span>{d.type} ({d.movement})</span>
                  <span>{d.equipments?.map((e: any) => `${e.freeDays || 0} ${e.calcType || "calendar"} days`).join(", ")}</span>
                </div>
              ))}
            </div>
          )}

          {result.potentialFees.length > 0 && (
            <div className="detail-section">
              <div className="detail-heading">potential fees</div>
              {result.potentialFees.map((fee, i) => <div key={i} className="detail-row"><span>{fee}</span></div>)}
            </div>
          )}

          {result.surchargeComments.length > 0 && (
            <div className="detail-section">
              <div className="detail-heading">notes</div>
              {result.surchargeComments.map((c, i) => <div key={i} className="detail-row" style={{ fontSize: 11 }}><span>{c}</span></div>)}
            </div>
          )}

          <div className="card-actions">
            <button className="btn" onClick={() => setShowBooking(true)}>
              Book
            </button>
          </div>
        </div>
      )}

      {/* Section 4 — Booking Form */}
      {showBooking && !confirmation && (
        <div className="card">
          {/* Read-only summary */}
          <div className="detail-section">
            <div className="detail-heading">booking summary</div>
            <div className="detail-row"><span className="detail-key">route</span><span>{result?.pol} ({result?.polCode}) &rarr; {result?.pod} ({result?.podCode})</span></div>
            <div className="detail-row"><span className="detail-key">equipment</span><span>{selectedEquip?.type} ({selectedEquip?.iso})</span></div>
            <div className="detail-row"><span className="detail-key">rate</span><span>${selectedEquip?.amount.toLocaleString()} {selectedEquip?.currency}</span></div>
            {result?.transitTime && <div className="detail-row"><span className="detail-key">transit</span><span>{result.transitTime}</span></div>}
            {quotation && <div className="detail-row"><span className="detail-key">quotation ref</span><span>{quotation.quotationReference}</span></div>}
            {quotation?.webBookingUrl && (
              <div className="detail-row">
                <span className="detail-key">web booking</span>
                <a href={quotation.webBookingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#000" }}>Book on CMA CGM &rarr;</a>
              </div>
            )}
          </div>

          {/* Shipper */}
          <PartyFields label="shipper *" party={shipper} setParty={setShipper} />

          {/* Consignee */}
          <PartyFields label="consignee *" party={consignee} setParty={setConsignee} />

          {/* Notify party toggle */}
          <div className="notify-toggle">
            <label>
              <input type="checkbox" checked={showNotify} onChange={e => setShowNotify(e.target.checked)} />
              {" "}add notify party
            </label>
          </div>
          {showNotify && <PartyFields label="notify party" party={notifyParty} setParty={setNotifyParty} />}

          {/* Cargo details */}
          <div className="detail-section" style={{ marginTop: 24 }}>
            <div className="detail-heading">cargo</div>
            <div className="form-grid">
              <div className="field span-2">
                <input type="text" value={commodityDesc} onChange={e => setCommodityDesc(e.target.value)} placeholder="e.g. Auto parts, garments" />
                <label>commodity description *</label>
              </div>
              <div className="field">
                <input type="text" value={commodityCode} onChange={e => setCommodityCode(e.target.value)} placeholder="e.g. 870899" maxLength={6} />
                <label>HS code *</label>
              </div>
              <div className="field">
                <input type="number" value={eqQty} onChange={e => setEqQty(e.target.value)} placeholder="1" min={1} />
                <label>container qty</label>
              </div>
              <div className="field">
                <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="20000" />
                <label>total weight *</label>
              </div>
              <div className="field">
                <div className="radio-group">
                  <label><input type="radio" name="wuom" checked={weightUOM === "KGM"} onChange={() => setWeightUOM("KGM")} /> KGM</label>
                  <label><input type="radio" name="wuom" checked={weightUOM === "LBS"} onChange={() => setWeightUOM("LBS")} /> LBS</label>
                </div>
                <label>weight unit</label>
              </div>
              <div className="field">
                <input type="number" value={volume} onChange={e => setVolume(e.target.value)} placeholder="30" />
                <label>volume (CBM) *</label>
              </div>
            </div>
          </div>

          {/* Payment + reference */}
          <div className="detail-section" style={{ marginTop: 24 }}>
            <div className="detail-heading">payment &amp; reference</div>
            <div className="form-grid">
              <div className="field">
                <div className="radio-group">
                  <label><input type="radio" name="fpm" checked={freightPayment === "Collect"} onChange={() => setFreightPayment("Collect")} /> Collect</label>
                  <label><input type="radio" name="fpm" checked={freightPayment === "Prepaid"} onChange={() => setFreightPayment("Prepaid")} /> Prepaid</label>
                </div>
                <label>freight payment</label>
              </div>
              <div className="field">
                <input type="text" value={customerRef} onChange={e => setCustomerRef(e.target.value)} placeholder="Auto-generated if blank" />
                <label>customer reference</label>
              </div>
              <div className="field span-2">
                <textarea value={bookingRemarks} onChange={e => setBookingRemarks(e.target.value)} placeholder="Special instructions, notes..." rows={3} />
                <label>booking remarks</label>
              </div>
            </div>
          </div>

          {/* Phase 2 stubs — toggles will go here */}
          {/* TODO: Reefer, Hazardous, VAS, SOC, Carrier Haulage toggles */}

          <div className="card-actions">
            <button className="btn" onClick={submitBooking} disabled={submitting}>
              {submitting ? "loading..." : "Confirm"}
            </button>
          </div>
        </div>
      )}

      {/* Booking confirmation */}
      {confirmation && (
        <div className="card">
          <div className="detail-heading">booking submitted</div>
          <div className="detail-row" style={{ marginTop: 16 }}><span className="detail-key">reference</span><span>{confirmation.bookingRef}</span></div>
          <div className="detail-row"><span className="detail-key">status</span><span>{confirmation.status}</span></div>
          <div className="detail-row"><span>{confirmation.message}</span></div>
        </div>
      )}
    </div>
  );
}
