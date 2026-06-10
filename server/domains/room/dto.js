// ──────────────────────────────────────────────────────────
// room/dto — response shaping for the room domain.
// Exposes the populated Office (name/code) instead of a free location string.
// ──────────────────────────────────────────────────────────

const officeRef = (office) => {
  if (!office) return null;
  if (typeof office !== 'object') return { _id: office };
  return { _id: office._id, name: office.name, code: office.code };
};

const roomDto = (r) => {
  if (!r) return null;
  const v = typeof r.toObject === 'function' ? r.toObject() : r;
  return {
    _id: v._id,
    name: v.name,
    code: v.code,
    officeId: v.officeId && typeof v.officeId === 'object' ? v.officeId._id : (v.officeId || null),
    office: officeRef(v.officeId),
    seats: v.seats ?? null,
    isActive: v.isActive !== false,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
};

module.exports = { roomDto };
