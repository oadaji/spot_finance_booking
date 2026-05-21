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
  to?: string;
  departure?: string;
  arrival?: string;
}

interface SearchResult {
  offerId: string;
  pol: string;
  polCode: string;
  pod: string;
  podCode: string;
  departureDate?: string;
  arrivalDate?: string;
  validFrom?: string;
  validTo?: string;
  transitTime?: string;
  commodity?: string;
  equipment: Equipment[];
  blSurcharges: BlSurcharge[];
  surchargeComments: string[];
  legs: Leg[];
  potentialFees: string[];
  ddsmConditions: any[];
  commentToCustomer?: string;
  carbonFootprint?: number;
}

interface BookingConfirmation {
  bookingRef: string;
  status: string;
  message: string;
}

interface QuotationResult {
  quotationReference: string;
  webBookingUrl?: string;
}

const API = process.env.REACT_APP_API_URL || "/api";

export default function App() {
  const [pol, setPol] = useState("");
  const [pod, setPod] = useState("");
  const [date, setDate] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selectedEquip, setSelectedEquip] = useState<Equipment | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [booking, setBooking] = useState({
    shipper: "", consignee: "", commodity: "",
    cargoDescription: "", contactEmail: "", references: "",
  });
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
    }
    setConverting(false);
  };

  const submitBooking = async () => {
    if (!booking.shipper || !booking.consignee) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/cma-cgm/booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pol: result?.polCode,
          pod: result?.podCode,
          equipment: selectedEquip?.iso,
          departureDate: result?.departureDate,
          quotationReference: quotation?.quotationReference,
          ...booking,
        }),
      });
      const data = await res.json();
      setConfirmation(data);
    } catch {
      alert("Booking failed");
    }
    setSubmitting(false);
  };

  const fmtDateTime = (d?: string) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="container">
      {/* Section 1 — Search */}
      <div className="card">
        <div className="search-row">
          <div className="field">
            <input
              type="text"
              value={pol}
              onChange={(e) => setPol(e.target.value)}
              placeholder="CNSHA"
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <label>pol</label>
          </div>
          <div className="field">
            <input
              type="text"
              value={pod}
              onChange={(e) => setPod(e.target.value)}
              placeholder="NGAPP"
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <label>pod</label>
          </div>
          <div className="field field-date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <label>date</label>
          </div>
          <button className="btn" onClick={search} disabled={searching}>
            {searching ? "loading..." : "Search"}
          </button>
        </div>
        {error && <div className="error-msg">{error}</div>}
      </div>

      {/* Section 2 — Rate Results */}
      {result && (
        <div className="card">
          <div className="rate-header">
            <span>{result.pol} ({result.polCode}) --&gt; {result.pod} ({result.podCode})</span>
            <span>Valid to: {result.validTo || "—"}</span>
          </div>
          {result.transitTime && (
            <div className="rate-meta">
              Transit: {result.transitTime}
              {result.departureDate && <> &middot; ETD: {fmtDateTime(result.departureDate)}</>}
              {result.arrivalDate && <> &middot; ETA: {fmtDateTime(result.arrivalDate)}</>}
            </div>
          )}
          <div className="equipment-row">
            {result.equipment.filter(e => e.available).map((eq) => (
              <div
                key={eq.iso}
                className={`equip-tile ${selectedEquip?.iso === eq.iso ? "equip-selected" : ""}`}
                onClick={() => selectEquipment(eq)}
              >
                <div className="equip-label">{eq.type}</div>
                <div className="equip-amount">
                  ${eq.amount.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 3 — Extra Details */}
      {selectedEquip && result && (
        <div className="card">
          <div className="detail-section">
            <div className="detail-row">
              <span className="detail-key">selected</span>
              <span>{selectedEquip.type} ({selectedEquip.iso})</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">all-in rate</span>
              <span>${selectedEquip.amount.toLocaleString()} {selectedEquip.currency}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">basic ocean freight</span>
              <span>${selectedEquip.basicFreight.toLocaleString()} {selectedEquip.currency}</span>
            </div>
            {result.transitTime && (
              <div className="detail-row">
                <span className="detail-key">transit time</span>
                <span>{result.transitTime}</span>
              </div>
            )}
            {selectedEquip.maxNetWeight && (
              <div className="detail-row">
                <span className="detail-key">max net weight</span>
                <span>{selectedEquip.maxNetWeight} tons</span>
              </div>
            )}
          </div>

          {/* Routing legs */}
          {result.legs.length > 0 && (
            <div className="detail-section">
              <div className="detail-heading">routing</div>
              {result.legs.map((leg) => (
                <div key={leg.legNumber} className="detail-row">
                  <span>{leg.from} &rarr; {leg.to}</span>
                  <span>{leg.vessel || ""} {leg.voyage || ""}</span>
                </div>
              ))}
            </div>
          )}

          {/* Equipment surcharges */}
          {selectedEquip.surcharges.length > 0 && (
            <div className="detail-section">
              <div className="detail-heading">surcharges ({selectedEquip.type})</div>
              {selectedEquip.surcharges.filter(s => !s.includedInFreight).map((s, i) => (
                <div key={i} className="detail-row">
                  <span>{s.name}{s.paymentMethod ? ` (${s.paymentMethod})` : ""}</span>
                  <span>${s.amount.toLocaleString()} {s.currency}</span>
                </div>
              ))}
            </div>
          )}

          {/* BL surcharges */}
          {result.blSurcharges.length > 0 && (
            <div className="detail-section">
              <div className="detail-heading">per-BL charges</div>
              {result.blSurcharges.map((s, i) => (
                <div key={i} className="detail-row">
                  <span>{s.name}{s.paymentMethod ? ` (${s.paymentMethod})` : ""}</span>
                  <span>${s.amount.toLocaleString()} {s.currency}</span>
                </div>
              ))}
            </div>
          )}

          {/* DDSM conditions */}
          {result.ddsmConditions.length > 0 && (
            <div className="detail-section">
              <div className="detail-heading">free time</div>
              {result.ddsmConditions.map((d, i) => (
                <div key={i} className="detail-row">
                  <span>{d.type} ({d.movement})</span>
                  <span>
                    {d.equipments?.map((e: any) => `${e.freeDays || 0} ${e.calcType || "calendar"} days`).join(", ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Potential fees */}
          {result.potentialFees.length > 0 && (
            <div className="detail-section">
              <div className="detail-heading">potential fees</div>
              {result.potentialFees.map((fee, i) => (
                <div key={i} className="detail-row">
                  <span>{fee}</span>
                </div>
              ))}
            </div>
          )}

          {/* Surcharge comments */}
          {result.surchargeComments.length > 0 && (
            <div className="detail-section">
              <div className="detail-heading">notes</div>
              {result.surchargeComments.map((c, i) => (
                <div key={i} className="detail-row" style={{ fontSize: 11 }}>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          )}

          {result.commentToCustomer && (
            <div className="detail-section">
              <div className="detail-row" style={{ fontStyle: "italic" }}>
                <span>{result.commentToCustomer}</span>
              </div>
            </div>
          )}

          <div className="card-actions">
            <button className="btn" onClick={convertToQuotation} disabled={converting}>
              {converting ? "loading..." : "Book"}
            </button>
          </div>
        </div>
      )}

      {/* Section 4 — Booking Form */}
      {showBooking && !confirmation && (
        <div className="card">
          {quotation && (
            <div className="detail-section">
              <div className="detail-row">
                <span className="detail-key">quotation ref</span>
                <span>{quotation.quotationReference}</span>
              </div>
              {quotation.webBookingUrl && (
                <div className="detail-row">
                  <span className="detail-key">web booking</span>
                  <a href={quotation.webBookingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#000" }}>
                    Book on CMA CGM website &rarr;
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="detail-heading" style={{ marginBottom: 20 }}>booking details</div>
          <div className="form-grid">
            <div className="field">
              <input type="text" value={booking.shipper} onChange={(e) => setBooking({ ...booking, shipper: e.target.value })} placeholder="Company name" />
              <label>shipper</label>
            </div>
            <div className="field">
              <input type="text" value={booking.consignee} onChange={(e) => setBooking({ ...booking, consignee: e.target.value })} placeholder="Company name" />
              <label>consignee</label>
            </div>
            <div className="field">
              <input type="text" value={booking.commodity} onChange={(e) => setBooking({ ...booking, commodity: e.target.value })} placeholder="e.g. Auto parts" />
              <label>commodity</label>
            </div>
            <div className="field">
              <input type="text" value={booking.cargoDescription} onChange={(e) => setBooking({ ...booking, cargoDescription: e.target.value })} placeholder="Brief description" />
              <label>cargo description</label>
            </div>
            <div className="field">
              <input type="email" value={booking.contactEmail} onChange={(e) => setBooking({ ...booking, contactEmail: e.target.value })} placeholder="you@company.com" />
              <label>contact email</label>
            </div>
            <div className="field">
              <input type="text" value={booking.references} onChange={(e) => setBooking({ ...booking, references: e.target.value })} placeholder="PO / reference number" />
              <label>references</label>
            </div>
          </div>
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
          <div className="detail-heading">booking confirmed</div>
          <div className="detail-row" style={{ marginTop: 16 }}>
            <span className="detail-key">reference</span>
            <span>{confirmation.bookingRef}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">status</span>
            <span>{confirmation.status}</span>
          </div>
          <div className="detail-row">
            <span>{confirmation.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
