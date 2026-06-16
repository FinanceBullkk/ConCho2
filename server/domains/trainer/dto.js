// ──────────────────────────────────────────────────────────
// trainer/dto — response shaping for A6 (trainer-management, H2).
// The rating aggregate (avg + count) is DERIVED here, never stored.
// ──────────────────────────────────────────────────────────

const ratingAggregate = (ratings = []) => {
  if (!ratings.length) return { ratingAvg: null, ratingCount: 0 };
  const sum = ratings.reduce((acc, r) => acc + (r.value || 0), 0);
  return { ratingAvg: Math.round((sum / ratings.length) * 10) / 10, ratingCount: ratings.length };
};

// One trainer row: the User identity + their profile + derived rating.
// `user` is the looked-up User (name/empCode/role); `profile` may be null for a
// candidate (a Teacher/Admin with no TrainerProfile yet).
const toTrainer = (user, profile, { busy } = {}) => {
  const ratings = profile?.ratings || [];
  return {
    userId: String(user._id),
    name: user.name,
    empCode: user.empCode,
    department: user.department || null,
    role: user.role,
    hasProfile: !!profile,
    status: profile?.status || null,
    canDeliver: (profile?.canDeliver || []).map(String),
    availability: profile?.availability || [],
    note: profile?.note || '',
    ...ratingAggregate(ratings),
    ...(busy === undefined ? {} : { free: !busy }),
  };
};

module.exports = { toTrainer, ratingAggregate };
