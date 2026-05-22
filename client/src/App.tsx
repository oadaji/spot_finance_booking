import React, { useState, useEffect, useCallback } from "react";
import "./App.css";

// ─── Types ──────────────────────────────────────────────────
interface Equipment { type: string; iso: string; amount: number; basicFreight: number; currency: string; available: boolean; maxNetWeight?: number; surcharges: { name: string; code?: string; amount: number; currency: string; includedInFreight?: boolean; paymentMethod?: string }[] }
interface BlSurcharge { name: string; amount: number; currency: string; paymentMethod?: string }
interface Leg { legNumber: number; vessel?: string; voyage?: string; service?: string; from?: string; fromCode?: string; to?: string; toCode?: string; departure?: string; arrival?: string; callIdFrom?: string; callIdTo?: string }
interface SearchResult { offerId: string; offerType?: string; pol: string; polCode: string; pod: string; podCode: string; departureDate?: string; arrivalDate?: string; validFrom?: string; validTo?: string; transitTime?: string; shippingCompany?: string; commodity?: string; commodityCode?: string; equipment: Equipment[]; blSurcharges: BlSurcharge[]; surchargeComments: string[]; legs: Leg[]; potentialFees: string[]; ddsmConditions: any[]; commentToCustomer?: string; carbonFootprint?: number }
interface PartyForm { name: string; address1: string; address2: string; address3: string; zipCode: string; stateOrProvince: string; city: string; country: string; contactName: string; contactEmail: string }
interface Cutoffs { vesselDeparture: string; docCutoff: string; vgmCutoff: string; gateInCutoff: string; customsCutoff: string; dgCutoff?: string }
interface BookingResult { bookingReference: string; status: string; cutoffs: Cutoffs; vesselDeparture: string; payload: any }
interface BookingRecord { id: string; bookingReference: string; status: string; createdAt: string; updatedAt: string; quoteSnapshot: any; payload: any; cutoffs: Cutoffs; amendmentHistory: any[] }

type View = "search" | "bookings" | "detail";
const API = process.env.REACT_APP_API_URL || "/api";
const emptyParty = (): PartyForm => ({ name: "", address1: "", address2: "", address3: "", zipCode: "", stateOrProvince: "", city: "", country: "", contactName: "", contactEmail: "" });

const fmtDate = (d?: string) => { if (!d) return "\u2014"; return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
const fmtShort = (d?: string) => { if (!d) return "\u2014"; return new Date(d).toISOString().slice(0, 10); };
const daysUntil = (d?: string) => { if (!d) return null; const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000); return diff; };

export default function App() {
  const [view, setView] = useState<View>("search");

  // Search state
  const [pol, setPol] = useState(""); const [pod, setPod] = useState(""); const [date, setDate] = useState("");
  const [searching, setSearching] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState<SearchResult | null>(null);
  const [selectedEquip, setSelectedEquip] = useState<Equipment | null>(null); const [showBooking, setShowBooking] = useState(false);

  // Booking form
  const [shipper, setShipper] = useState<PartyForm>(emptyParty()); const [consignee, setConsignee] = useState<PartyForm>(emptyParty());
  const [showNotify, setShowNotify] = useState(false); const [notifyParty, setNotifyParty] = useState<PartyForm>(emptyParty());
  const [commodityDesc, setCommodityDesc] = useState(""); const [commodityCode, setCommodityCode] = useState("");
  const [weight, setWeight] = useState(""); const [weightUOM, setWeightUOM] = useState<"KGM" | "LBS">("KGM");
  const [volume, setVolume] = useState(""); const [eqQty, setEqQty] = useState("1");
  const [freightPayment, setFreightPayment] = useState<"Collect" | "Prepaid">("Collect");
  const [customerRef, setCustomerRef] = useState(""); const [bookingRemarks, setBookingRemarks] = useState("");
  const [confirmation, setConfirmation] = useState<BookingResult | null>(null); const [submitting, setSubmitting] = useState(false);

  // Bookings list
  const [bookings, setBookings] = useState<BookingRecord[]>([]); const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsFilter, setBookingsFilter] = useState(""); const [bookingsSort, setBookingsSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "", dir: "asc" });

  // Detail view
  const [detail, setDetail] = useState<BookingRecord | null>(null); const [showPayload, setShowPayload] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // ─── Data fetching ─────────────────────────────────────────
  const loadBookings = useCallback(async () => {
    setBookingsLoading(true);
    try { const res = await fetch(`${API}/cma-cgm/bookings`); setBookings(await res.json()); } catch { /* ignore */ }
    finally { setBookingsLoading(false); }
  }, []);

  useEffect(() => { if (view === "bookings") loadBookings(); }, [view, loadBookings]);

  // ─── Search ────────────────────────────────────────────────
  const search = async () => {
    if (!pol || !pod) return;
    setSearching(true); setError(""); setResult(null); setSelectedEquip(null); setShowBooking(false); setConfirmation(null);
    try {
      const res = await fetch(`${API}/cma-cgm/spot-search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pol: pol.toUpperCase(), pod: pod.toUpperCase(), date: date || undefined }) });
      const data = await res.json();
      if (!res.ok) setError(data.error || data.messages?.join(", ") || "No rates found");
      else setResult(data);
    } catch { setError("Search failed"); }
    finally { setSearching(false); }
  };

  // ─── Book ──────────────────────────────────────────────────
  const submitBooking = async () => {
    if (!shipper.name || !consignee.name || !commodityDesc || !commodityCode || !weight || !volume) { setError("Fill in all required fields"); return; }
    setSubmitting(true); setError("");
    try {
      const spotOffer = { offerId: result?.offerId, polCode: result?.polCode, polName: result?.pol, podCode: result?.podCode, podName: result?.pod, shippingCompany: result?.shippingCompany, agreementReference: "", legs: (result?.legs || []).map(l => ({ legNumber: l.legNumber, from: l.from, fromCode: l.fromCode, to: l.to, toCode: l.toCode, vessel: l.vessel, voyage: l.voyage, service: l.service, departure: l.departure, arrival: l.arrival, callIdFrom: l.callIdFrom, callIdTo: l.callIdTo })) };
      const form = { customerReference: customerRef || undefined, freightPaymentMode: freightPayment, bookingRemarks, shipper, consignee, notifyParty: showNotify ? notifyParty : undefined, cargos: [{ equipmentIsoCode: selectedEquip?.iso || "20GP", equipmentQuantity: parseInt(eqQty) || 1, commodityCode, commodityDescription: commodityDesc, weight: parseFloat(weight) || 0, weightUOM, volume: parseFloat(volume) || 0, volumeUOM: "MTQ" as const }] };
      const res = await fetch(`${API}/cma-cgm/booking`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spotOffer, form }) });
      const data = await res.json();
      if (res.ok) setConfirmation(data); else setError(data.error || "Booking failed");
    } catch { setError("Booking submission failed"); }
    finally { setSubmitting(false); }
  };

  // ─── Cancel ────────────────────────────────────────────────
  const cancelBooking = async (ref: string) => {
    if (!window.confirm(`Cancel booking ${ref}?`)) return;
    setCancelling(true);
    try {
      const res = await fetch(`${API}/cma-cgm/bookings/${ref}/cancel`, { method: "PUT" });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      setDetail(data);
      loadBookings();
    } catch { alert("Cancel failed"); }
    finally { setCancelling(false); }
  };

  // ─── Open detail ───────────────────────────────────────────
  const openDetail = async (ref: string) => {
    try {
      const res = await fetch(`${API}/cma-cgm/bookings/${ref}`);
      const data = await res.json();
      setDetail(data); setView("detail"); setShowPayload(false);
    } catch { alert("Failed to load booking"); }
  };

  // ─── Nav ───────────────────────────────────────────────────
  const goSearch = () => { setView("search"); setConfirmation(null); };
  const goBookings = () => { setView("bookings"); };

  // ─── Helper: Party display ─────────────────────────────────
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

  // ─── Bookings list helpers ─────────────────────────────────
  const filteredBookings = bookings.filter(b => {
    if (!bookingsFilter) return true;
    const q = bookingsFilter.toLowerCase();
    const pol = b.payload?.portOfLoading?.internalCode || "";
    const pod = b.payload?.portOfDischarge?.internalCode || "";
    const vessel = b.payload?.journeyLegs?.[0]?.transportation?.vehicule?.vehiculeName || "";
    return b.bookingReference.toLowerCase().includes(q) || `${pol}${pod}`.toLowerCase().includes(q) || vessel.toLowerCase().includes(q);
  });

  const sortedBookings = [...filteredBookings].sort((a, b) => {
    const { col, dir } = bookingsSort;
    if (!col) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    let va: any, vb: any;
    if (col === "reference") { va = a.bookingReference; vb = b.bookingReference; }
    else if (col === "status") { va = a.status; vb = b.status; }
    else if (col === "route") { va = (a.payload?.portOfLoading?.internalCode || "") + (a.payload?.portOfDischarge?.internalCode || ""); vb = (b.payload?.portOfLoading?.internalCode || "") + (b.payload?.portOfDischarge?.internalCode || ""); }
    else return 0;
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (col: string) => {
    if (bookingsSort.col === col) setBookingsSort({ col, dir: bookingsSort.dir === "asc" ? "desc" : "asc" });
    else setBookingsSort({ col, dir: "asc" });
  };

  const cutoffSoon = (b: BookingRecord) => {
    const d = daysUntil(b.cutoffs?.docCutoff);
    return d !== null && d >= 0 && d <= 3;
  };

  const sailed = (b: BookingRecord) => {
    const d = daysUntil(b.cutoffs?.vesselDeparture);
    return d !== null && d < 0;
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="container">
      {/* Nav */}
      <div className="nav-bar">
        <span className="nav-title" onClick={goSearch}>spot / finance / booking</span>
        <div className="nav-links">
          <span className={view === "search" ? "nav-active" : ""} onClick={goSearch}>search</span>
          <span className={view === "bookings" ? "nav-active" : ""} onClick={goBookings}>bookings</span>
        </div>
      </div>

      {/* ═══ SEARCH VIEW ═══ */}
      {view === "search" && !confirmation && (
        <>
          {/* Section 1 */}
          <div className="card">
            <div className="search-row">
              <div className="field"><input type="text" value={pol} onChange={e => setPol(e.target.value)} placeholder="CNSHA" onKeyDown={e => e.key === "Enter" && search()} /><label>pol</label></div>
              <div className="field"><input type="text" value={pod} onChange={e => setPod(e.target.value)} placeholder="NGAPP" onKeyDown={e => e.key === "Enter" && search()} /><label>pod</label></div>
              <div className="field field-date"><input type="date" value={date} onChange={e => setDate(e.target.value)} /><label>date</label></div>
              <button className="btn" onClick={search} disabled={searching}>{searching ? "loading..." : "Search"}</button>
            </div>
          </div>

          {error && <div className="error-msg">{error}</div>}

          {/* Section 2 */}
          {result && (
            <div className="card">
              <div className="rate-header">
                <span>{result.pol} ({result.polCode}) --&gt; {result.pod} ({result.podCode})</span>
                <span>Valid to: {result.validTo || "\u2014"}</span>
              </div>
              {result.transitTime && <div className="rate-meta">Transit: {result.transitTime}{result.departureDate && <> &middot; ETD: {fmtDate(result.departureDate)}</>}{result.arrivalDate && <> &middot; ETA: {fmtDate(result.arrivalDate)}</>}</div>}
              <div className="equipment-row">
                {result.equipment.filter(e => e.available).map(eq => (
                  <div key={eq.iso} className={`equip-tile ${selectedEquip?.iso === eq.iso ? "equip-selected" : ""}`} onClick={() => { setSelectedEquip(eq); setShowBooking(false); setConfirmation(null); }}>
                    <div className="equip-label">{eq.type}</div>
                    <div className="equip-amount">${eq.amount.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3 */}
          {selectedEquip && result && (
            <div className="card">
              <div className="detail-section">
                <div className="detail-row"><span className="detail-key">selected</span><span>{selectedEquip.type} ({selectedEquip.iso})</span></div>
                <div className="detail-row"><span className="detail-key">all-in rate</span><span>${selectedEquip.amount.toLocaleString()} {selectedEquip.currency}</span></div>
                <div className="detail-row"><span className="detail-key">basic ocean freight</span><span>${selectedEquip.basicFreight.toLocaleString()} {selectedEquip.currency}</span></div>
                {result.transitTime && <div className="detail-row"><span className="detail-key">transit time</span><span>{result.transitTime}</span></div>}
                {selectedEquip.maxNetWeight && <div className="detail-row"><span className="detail-key">max net weight</span><span>{selectedEquip.maxNetWeight} tons</span></div>}
              </div>
              {result.legs.length > 0 && <div className="detail-section"><div className="detail-heading">routing</div>{result.legs.map(l => <div key={l.legNumber} className="detail-row"><span>{l.from} &rarr; {l.to}</span><span>{l.vessel || ""} {l.voyage || ""}</span></div>)}</div>}
              {selectedEquip.surcharges.filter(s => !s.includedInFreight).length > 0 && <div className="detail-section"><div className="detail-heading">surcharges ({selectedEquip.type})</div>{selectedEquip.surcharges.filter(s => !s.includedInFreight).map((s, i) => <div key={i} className="detail-row"><span>{s.name}</span><span>${s.amount.toLocaleString()} {s.currency}</span></div>)}</div>}
              {result.blSurcharges.length > 0 && <div className="detail-section"><div className="detail-heading">per-BL charges</div>{result.blSurcharges.map((s, i) => <div key={i} className="detail-row"><span>{s.name}</span><span>${s.amount.toLocaleString()} {s.currency}</span></div>)}</div>}
              {result.ddsmConditions.length > 0 && <div className="detail-section"><div className="detail-heading">free time</div>{result.ddsmConditions.map((d, i) => <div key={i} className="detail-row"><span>{d.type} ({d.movement})</span><span>{d.equipments?.map((e: any) => `${e.freeDays || 0} ${e.calcType || "calendar"} days`).join(", ")}</span></div>)}</div>}
              {result.potentialFees.length > 0 && <div className="detail-section"><div className="detail-heading">potential fees</div>{result.potentialFees.map((f, i) => <div key={i} className="detail-row"><span>{f}</span></div>)}</div>}
              <div className="card-actions"><button className="btn" onClick={() => setShowBooking(true)}>Book</button></div>
            </div>
          )}

          {/* Section 4 — Booking Form */}
          {showBooking && (
            <div className="card">
              <div className="detail-section">
                <div className="detail-heading">booking summary</div>
                <div className="detail-row"><span className="detail-key">route</span><span>{result?.pol} ({result?.polCode}) &rarr; {result?.pod} ({result?.podCode})</span></div>
                <div className="detail-row"><span className="detail-key">equipment</span><span>{selectedEquip?.type} ({selectedEquip?.iso})</span></div>
                <div className="detail-row"><span className="detail-key">rate</span><span>${selectedEquip?.amount.toLocaleString()} {selectedEquip?.currency}</span></div>
                {result?.transitTime && <div className="detail-row"><span className="detail-key">transit</span><span>{result.transitTime}</span></div>}
              </div>
              <PartyFields label="shipper *" party={shipper} setParty={setShipper} />
              <PartyFields label="consignee *" party={consignee} setParty={setConsignee} />
              <div className="notify-toggle"><label><input type="checkbox" checked={showNotify} onChange={e => setShowNotify(e.target.checked)} /> add notify party</label></div>
              {showNotify && <PartyFields label="notify party" party={notifyParty} setParty={setNotifyParty} />}
              <div className="detail-section" style={{ marginTop: 24 }}>
                <div className="detail-heading">cargo</div>
                <div className="form-grid">
                  <div className="field span-2"><input type="text" value={commodityDesc} onChange={e => setCommodityDesc(e.target.value)} placeholder="e.g. Auto parts, garments" /><label>commodity description *</label></div>
                  <div className="field"><input type="text" value={commodityCode} onChange={e => setCommodityCode(e.target.value)} placeholder="e.g. 870899" maxLength={6} /><label>HS code *</label></div>
                  <div className="field"><input type="number" value={eqQty} onChange={e => setEqQty(e.target.value)} placeholder="1" min={1} /><label>container qty</label></div>
                  <div className="field"><input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="20000" /><label>total weight *</label></div>
                  <div className="field"><div className="radio-group"><label><input type="radio" name="wuom" checked={weightUOM === "KGM"} onChange={() => setWeightUOM("KGM")} /> KGM</label><label><input type="radio" name="wuom" checked={weightUOM === "LBS"} onChange={() => setWeightUOM("LBS")} /> LBS</label></div><label>weight unit</label></div>
                  <div className="field"><input type="number" value={volume} onChange={e => setVolume(e.target.value)} placeholder="30" /><label>volume (CBM) *</label></div>
                </div>
              </div>
              <div className="detail-section" style={{ marginTop: 24 }}>
                <div className="detail-heading">payment &amp; reference</div>
                <div className="form-grid">
                  <div className="field"><div className="radio-group"><label><input type="radio" name="fpm" checked={freightPayment === "Collect"} onChange={() => setFreightPayment("Collect")} /> Collect</label><label><input type="radio" name="fpm" checked={freightPayment === "Prepaid"} onChange={() => setFreightPayment("Prepaid")} /> Prepaid</label></div><label>freight payment</label></div>
                  <div className="field"><input type="text" value={customerRef} onChange={e => setCustomerRef(e.target.value)} placeholder="Auto-generated if blank" /><label>customer reference</label></div>
                  <div className="field span-2"><textarea value={bookingRemarks} onChange={e => setBookingRemarks(e.target.value)} placeholder="Special instructions, notes..." rows={3} /><label>booking remarks</label></div>
                </div>
              </div>
              <div className="card-actions"><button className="btn" onClick={submitBooking} disabled={submitting}>{submitting ? "loading..." : "Confirm"}</button></div>
            </div>
          )}
        </>
      )}

      {/* ═══ CONFIRMATION (Section 5) ═══ */}
      {view === "search" && confirmation && (() => {
        const c = confirmation;
        const p = c.payload;
        const leg = p?.journeyLegs?.[0];
        const vessel = leg?.transportation?.vehicule?.vehiculeName || "\u2014";
        const voyage = leg?.transportation?.voyage?.voyageReference || "\u2014";
        const polCode = p?.portOfLoading?.internalCode || "";
        const podCode = p?.portOfDischarge?.internalCode || "";
        const cargo = p?.cargos?.[0];
        const isAccepted = c.status === "accepted";

        return (
          <div className="card">
            <div className="confirm-header">{isAccepted ? "BOOKING ACCEPTED" : "BOOKING PENDING"}</div>
            {!isAccepted && <div className="confirm-note">Awaiting CMA CGM ops review — typically 4 hours.</div>}

            <div className="detail-section" style={{ marginTop: 20 }}>
              <div className="detail-row"><span className="detail-key">Reference</span><span>{c.bookingReference}</span></div>
              <div className="detail-row"><span className="detail-key">Status</span><span>{c.status}</span></div>
              <div className="detail-row"><span className="detail-key">Route</span><span>{polCode} &rarr; {podCode}</span></div>
              <div className="detail-row"><span className="detail-key">Vessel</span><span>{vessel}</span></div>
              <div className="detail-row"><span className="detail-key">Voyage</span><span>{voyage}</span></div>
              <div className="detail-row"><span className="detail-key">Departure</span><span>{fmtShort(c.vesselDeparture)}</span></div>
            </div>

            <div className="detail-section">
              <div className="detail-heading">key dates</div>
              <div className="detail-row"><span className="detail-key">Doc cutoff</span><span>{fmtShort(c.cutoffs.docCutoff)} ({daysUntil(c.cutoffs.docCutoff)} days)</span></div>
              <div className="detail-row"><span className="detail-key">VGM cutoff</span><span>{fmtShort(c.cutoffs.vgmCutoff)} ({daysUntil(c.cutoffs.vgmCutoff)} days)</span></div>
              <div className="detail-row"><span className="detail-key">Gate-in cutoff</span><span>{fmtShort(c.cutoffs.gateInCutoff)} ({daysUntil(c.cutoffs.gateInCutoff)} days)</span></div>
              <div className="detail-row"><span className="detail-key">Customs cutoff</span><span>{fmtShort(c.cutoffs.customsCutoff)} ({daysUntil(c.cutoffs.customsCutoff)} days)</span></div>
            </div>

            {cargo && (
              <div className="detail-section">
                <div className="detail-heading">containers</div>
                <div className="detail-row"><span>{cargo.equipmentQuantity} x {cargo.equipmentIsoCode} — {cargo.commodityDescription}</span></div>
                <div className="detail-row"><span>{cargo.weight?.toLocaleString()} {cargo.weightUOM}, {cargo.volume} {cargo.volumeUOM}</span></div>
              </div>
            )}

            <div className="card-actions">
              <button className="btn" onClick={goBookings}>view all bookings</button>
              <button className="btn" onClick={() => { setConfirmation(null); setShowBooking(false); setResult(null); setSelectedEquip(null); setError(""); }}>new booking</button>
            </div>
          </div>
        );
      })()}

      {/* ═══ BOOKINGS LIST ═══ */}
      {view === "bookings" && (
        <>
          <div className="list-header">
            <span className="list-title">BOOKINGS</span>
            <button className="btn" onClick={goSearch}>+ new booking</button>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <input type="text" value={bookingsFilter} onChange={e => setBookingsFilter(e.target.value)} placeholder="Filter by reference, route, or vessel..." />
          </div>

          {bookingsLoading ? <div className="mono-text">loading...</div> : sortedBookings.length === 0 ? <div className="mono-text">No bookings found</div> : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="bookings-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort("reference")}>Reference {bookingsSort.col === "reference" ? (bookingsSort.dir === "asc" ? "\u25B2" : "\u25BC") : ""}</th>
                    <th onClick={() => toggleSort("route")}>Route {bookingsSort.col === "route" ? (bookingsSort.dir === "asc" ? "\u25B2" : "\u25BC") : ""}</th>
                    <th>Vessel</th>
                    <th onClick={() => toggleSort("status")}>Status {bookingsSort.col === "status" ? (bookingsSort.dir === "asc" ? "\u25B2" : "\u25BC") : ""}</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBookings.map(b => {
                    const polC = b.payload?.portOfLoading?.internalCode || "?";
                    const podC = b.payload?.portOfDischarge?.internalCode || "?";
                    const vessel = b.payload?.journeyLegs?.[0]?.transportation?.vehicule?.vehiculeName || "\u2014";
                    const isSailed = sailed(b);
                    const isCutoffSoon = cutoffSoon(b);
                    let statusText = b.status;
                    if (isSailed && b.status === "accepted") statusText = "sailed";

                    return (
                      <tr key={b.bookingReference} onClick={() => openDetail(b.bookingReference)}>
                        <td>{b.bookingReference}</td>
                        <td>{polC}&rarr;{podC}</td>
                        <td>{vessel}</td>
                        <td>{statusText}{isCutoffSoon && b.status === "accepted" ? " *" : ""}</td>
                        <td><span className="table-link" onClick={e => { e.stopPropagation(); openDetail(b.bookingReference); }}>[view]</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══ BOOKING DETAIL ═══ */}
      {view === "detail" && detail && (() => {
        const p = detail.payload;
        const leg = p?.journeyLegs?.[0];
        const vessel = leg?.transportation?.vehicule?.vehiculeName || "\u2014";
        const vesselRef = leg?.transportation?.vehicule?.reference || "";
        const vesselRefType = leg?.transportation?.vehicule?.referenceType || "";
        const voyage = leg?.transportation?.voyage?.voyageReference || "\u2014";
        const service = leg?.transportation?.voyage?.service?.code || "\u2014";
        const dep = leg?.pointFrom?.departureDateLocal;
        const arr = leg?.pointTo?.arrivalDateLocal;
        const polCode = p?.portOfLoading?.internalCode || "";
        const podCode = p?.portOfDischarge?.internalCode || "";
        const polName = leg?.pointFrom?.location?.name || polCode;
        const podName = leg?.pointTo?.location?.name || podCode;
        const shipperP = p?.parties?.find((pp: any) => pp.role === "SHP");
        const consigneeP = p?.parties?.find((pp: any) => pp.role === "CEE");
        const cargo = p?.cargos?.[0];
        const isSailed = sailed(detail);
        let statusText = detail.status;
        if (isSailed && detail.status === "accepted") statusText = "sailed";

        return (
          <>
            <div className="list-header">
              <span className="list-title">BOOKING {detail.bookingReference}</span>
              <button className="btn" onClick={goBookings}>back to list</button>
            </div>

            <div className="card">
              <div className="detail-section">
                <div className="detail-row"><span className="detail-key">Status</span><span>{statusText}</span></div>
                <div className="detail-row"><span className="detail-key">Created</span><span>{fmtShort(detail.createdAt)}</span></div>
              </div>

              <div className="detail-section">
                <div className="detail-heading">route</div>
                <div className="detail-row"><span className="detail-key">POL</span><span>{polCode}  {polName}</span></div>
                <div className="detail-row"><span className="detail-key">POD</span><span>{podCode}  {podName}</span></div>
                <div className="detail-row"><span className="detail-key">Vessel</span><span>{vessel}  ({vesselRefType} {vesselRef})</span></div>
                <div className="detail-row"><span className="detail-key">Voyage</span><span>{voyage}</span></div>
                <div className="detail-row"><span className="detail-key">Service</span><span>{service}</span></div>
                <div className="detail-row"><span className="detail-key">Departure</span><span>{fmtShort(dep)}</span></div>
                <div className="detail-row"><span className="detail-key">Arrival</span><span>{fmtShort(arr)}</span></div>
              </div>

              <div className="detail-section">
                <div className="detail-heading">key dates</div>
                <div className="detail-row"><span className="detail-key">Doc cutoff</span><span>{fmtShort(detail.cutoffs.docCutoff)}  (in {daysUntil(detail.cutoffs.docCutoff)} days)</span></div>
                <div className="detail-row"><span className="detail-key">VGM cutoff</span><span>{fmtShort(detail.cutoffs.vgmCutoff)}  (in {daysUntil(detail.cutoffs.vgmCutoff)} days)</span></div>
                <div className="detail-row"><span className="detail-key">Gate-in cutoff</span><span>{fmtShort(detail.cutoffs.gateInCutoff)}  (in {daysUntil(detail.cutoffs.gateInCutoff)} days)</span></div>
                <div className="detail-row"><span className="detail-key">Customs cutoff</span><span>{fmtShort(detail.cutoffs.customsCutoff)}  (in {daysUntil(detail.cutoffs.customsCutoff)} days)</span></div>
              </div>

              <div className="detail-section">
                <div className="detail-heading">parties</div>
                {shipperP && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="detail-row"><span className="detail-key">Shipper</span><span>{shipperP.name}</span></div>
                    <div className="detail-row"><span></span><span>{shipperP.address?.address1}{shipperP.address?.city ? `, ${shipperP.address.city}` : ""}{shipperP.address?.country ? ` ${shipperP.address.country}` : ""}</span></div>
                    <div className="detail-row"><span></span><span>{shipperP.contact?.emailAddress}</span></div>
                  </div>
                )}
                {consigneeP && (
                  <div>
                    <div className="detail-row"><span className="detail-key">Consignee</span><span>{consigneeP.name}</span></div>
                    <div className="detail-row"><span></span><span>{consigneeP.address?.address1}{consigneeP.address?.city ? `, ${consigneeP.address.city}` : ""}{consigneeP.address?.country ? ` ${consigneeP.address.country}` : ""}</span></div>
                    <div className="detail-row"><span></span><span>{consigneeP.contact?.emailAddress}</span></div>
                  </div>
                )}
              </div>

              {cargo && (
                <div className="detail-section">
                  <div className="detail-heading">cargo</div>
                  <div className="detail-row"><span>{cargo.equipmentQuantity} x {cargo.equipmentIsoCode} — dry</span></div>
                  <div className="detail-row"><span className="detail-key">Commodity</span><span>{cargo.commodityCode} — {cargo.commodityDescription}</span></div>
                  <div className="detail-row"><span className="detail-key">Weight</span><span>{cargo.weight?.toLocaleString()} {cargo.weightUOM}</span></div>
                  <div className="detail-row"><span className="detail-key">Volume</span><span>{cargo.volume} {cargo.volumeUOM}</span></div>
                </div>
              )}

              {/* Payload toggle */}
              <div className="detail-section">
                <div className="detail-heading" style={{ cursor: "pointer" }} onClick={() => setShowPayload(!showPayload)}>
                  payload (raw) {showPayload ? "\u25BC" : "\u25B6"}
                </div>
                {showPayload && <pre className="json-block">{JSON.stringify(p, null, 2)}</pre>}
              </div>

              <div className="card-actions">
                <button className="btn" onClick={() => alert("Amendment flow coming in next phase.")}>amend booking</button>
                <button className="btn" onClick={() => cancelBooking(detail.bookingReference)} disabled={cancelling || detail.status === "cancelled"}>
                  {cancelling ? "loading..." : "cancel booking"}
                </button>
                <button className="btn" onClick={() => setShowPayload(!showPayload)}>view as JSON</button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
