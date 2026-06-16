// ──────────────────────────────────────────────────────────
// vendor/dto — response shaping for A2 (vendor management, H2).
// Two values are DERIVED here (never stored → never drift):
//   • rating aggregate (avg + count) from the ratings array.
//   • renewal signal from the contracts' end dates.
// ──────────────────────────────────────────────────────────

const RENEWAL_WINDOW_DAYS = 60;

// Latest contract coverage end + a traffic-light renewal status:
//   none      → no contracts on file
//   expired   → coverage already lapsed (latest endsOn < now)
//   due-soon  → coverage ends within RENEWAL_WINDOW_DAYS
//   ok        → coverage runs beyond the window
const renewalSignal = (contracts = [], now = new Date()) => {
  const ends = contracts.map((c) => c.endsOn).filter(Boolean).map((d) => new Date(d).getTime());
  if (!ends.length) return { latestContractEndsOn: null, renewalStatus: 'none' };
  const latest = Math.max(...ends);
  const soon = now.getTime() + RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let renewalStatus = 'ok';
  if (latest < now.getTime()) renewalStatus = 'expired';
  else if (latest <= soon) renewalStatus = 'due-soon';
  return { latestContractEndsOn: new Date(latest), renewalStatus };
};

const ratingAggregate = (ratings = []) => {
  if (!ratings.length) return { ratingAvg: null, ratingCount: 0 };
  const sum = ratings.reduce((acc, r) => acc + (r.value || 0), 0);
  return { ratingAvg: Math.round((sum / ratings.length) * 10) / 10, ratingCount: ratings.length };
};

// Full vendor (detail view) — keeps the raw arrays + the derived signals.
const toVendor = (v, now = new Date()) => {
  if (!v) return v;
  return {
    ...v,
    ...ratingAggregate(v.ratings),
    ...renewalSignal(v.contracts, now),
  };
};

// Catalog row (list view) — derived signals + light counts, no heavy arrays.
const toVendorListItem = (v, now = new Date()) => {
  const { ratingAvg, ratingCount } = ratingAggregate(v.ratings);
  const renewal = renewalSignal(v.contracts, now);
  return {
    _id: v._id,
    name: v.name,
    type: v.type,
    status: v.status,
    note: v.note,
    contactCount: (v.contacts || []).length,
    deliversCount: (v.delivers || []).length,
    contractCount: (v.contracts || []).length,
    ratingAvg,
    ratingCount,
    ...renewal,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
};

module.exports = { toVendor, toVendorListItem, renewalSignal, ratingAggregate, RENEWAL_WINDOW_DAYS };
