import React, { useState } from "react";
import "./App.css";

interface Equipment {
  type: string;
  iso: string;
  amount: number;
  currency: string;
}

interface Surcharge {
  name: string;
  amount: number;
  currency: string;
}

interface SearchResult {
  pol: string;
  pod: string;
  departureDate: string;
  validTo: string;
  transitTime: string;
  vessel: string;
  voyage: string;
  service: string;
  equipment: Equipment[];
  surcharges: Surcharge[];
  included: string[];
  potential: string[];
}

interface BookingConfirmation {
  bookingRef: string;
  status: string;
  message: string;
}

const API = process.env.REACT_APP_API_URL || "/api";

export default function App() {
  const [pol, setPol] = useState("");
  const [pod, setPod] = useState("");
  const [date, setDate] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selectedEquip, setSelectedEquip] = useState<Equipment | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [booking, setBooking] = useState({
    shipper: "", consignee: "", commodity: "",
    cargoDescription: "", contactEmail: "", references: "",
  });
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const search = async () => {
    if (!pol || !pod || !date) return;
    setSearching(true);
    setResult(null);
    setSelectedEquip(null);
    setShowBooking(false);
    setConfirmation(null);
    try {
      const res = await fetch(`${API}/cma-cgm/spot-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pol, pod, date }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      alert("Search failed");
    }
    setSearching(false);
  };

  const selectEquipment = (eq: Equipment) => {
    setSelectedEquip(eq);
    setShowBooking(false);
    setConfirmation(null);
  };

  const submitBooking = async () => {
    if (!booking.shipper || !booking.consignee) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/cma-cgm/booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pol: result?.pol,
          pod: result?.pod,
          equipment: selectedEquip?.type,
          departureDate: result?.departureDate,
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
            />
            <label>pol</label>
          </div>
          <div className="field">
            <input
              type="text"
              value={pod}
              onChange={(e) => setPod(e.target.value)}
              placeholder="NGAPP"
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
      </div>

      {/* Section 2 — Rate Results */}
      {result && (
        <div className="card">
          <div className="rate-header">
            <span>{result.pol} --&gt; {result.pod}</span>
            <span>Valid to: {result.validTo}</span>
          </div>
          <div className="equipment-row">
            {result.equipment.map((eq) => (
              <div
                key={eq.type}
                className={`equip-tile ${selectedEquip?.type === eq.type ? "equip-selected" : ""}`}
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
              <span className="detail-key">base rate</span>
              <span>${selectedEquip.amount.toLocaleString()} {selectedEquip.currency}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">transit time</span>
              <span>{result.transitTime}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">vessel</span>
              <span>{result.vessel}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">voyage</span>
              <span>{result.voyage} / {result.service}</span>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-heading">surcharges</div>
            {result.surcharges.map((s, i) => (
              <div key={i} className="detail-row">
                <span>{s.name}</span>
                <span>${s.amount.toLocaleString()} {s.currency}</span>
              </div>
            ))}
            <div className="detail-row detail-total">
              <span>total (base + surcharges)</span>
              <span>
                ${(selectedEquip.amount + result.surcharges.reduce((a, s) => a + s.amount, 0)).toLocaleString()} USD
              </span>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-heading">included</div>
            {result.included.map((item, i) => (
              <div key={i} className="detail-row">
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="detail-section">
            <div className="detail-heading">potential fees</div>
            {result.potential.map((item, i) => (
              <div key={i} className="detail-row">
                <span>{item}</span>
              </div>
            ))}
          </div>

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
          <div className="detail-heading" style={{ marginBottom: 20 }}>booking details</div>
          <div className="form-grid">
            <div className="field">
              <input
                type="text"
                value={booking.shipper}
                onChange={(e) => setBooking({ ...booking, shipper: e.target.value })}
                placeholder="Company name"
              />
              <label>shipper</label>
            </div>
            <div className="field">
              <input
                type="text"
                value={booking.consignee}
                onChange={(e) => setBooking({ ...booking, consignee: e.target.value })}
                placeholder="Company name"
              />
              <label>consignee</label>
            </div>
            <div className="field">
              <input
                type="text"
                value={booking.commodity}
                onChange={(e) => setBooking({ ...booking, commodity: e.target.value })}
                placeholder="e.g. Auto parts"
              />
              <label>commodity</label>
            </div>
            <div className="field">
              <input
                type="text"
                value={booking.cargoDescription}
                onChange={(e) => setBooking({ ...booking, cargoDescription: e.target.value })}
                placeholder="Brief description"
              />
              <label>cargo description</label>
            </div>
            <div className="field">
              <input
                type="email"
                value={booking.contactEmail}
                onChange={(e) => setBooking({ ...booking, contactEmail: e.target.value })}
                placeholder="you@company.com"
              />
              <label>contact email</label>
            </div>
            <div className="field">
              <input
                type="text"
                value={booking.references}
                onChange={(e) => setBooking({ ...booking, references: e.target.value })}
                placeholder="PO / reference number"
              />
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
