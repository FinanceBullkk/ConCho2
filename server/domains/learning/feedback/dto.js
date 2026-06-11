const idOf = (value) => (value && value._id ? value._id : value) || null;

// Feedback view for Admin/Teacher listings and the submitter's own response.
// `userId`/`cohortId` are bare ObjectIds on a fresh upsert and populated docs on
// list reads — detect population by a real field rather than assuming a shape.
const feedbackDto = (fb) => {
  if (!fb) return null;
  const u = fb.userId;
  const userPopulated = u && typeof u === 'object' && u.name !== undefined;
  const c = fb.cohortId;
  const cohortPopulated = c && typeof c === 'object' && c.classCode !== undefined;
  return {
    id: fb._id,
    cohortId: idOf(fb.cohortId),
    cohortCode: cohortPopulated ? c.classCode : undefined,
    programId: idOf(fb.programId),
    learner: {
      id: idOf(fb.userId),
      name: userPopulated ? u.name : undefined,
      empCode: userPopulated ? u.empCode : undefined,
      department: userPopulated ? u.department : undefined,
    },
    rating: fb.rating,
    contentRating: fb.contentRating ?? null,
    instructorRating: fb.instructorRating ?? null,
    comment: fb.comment || '',
    submittedBy: idOf(fb.submittedBy),
    createdAt: fb.createdAt,
    updatedAt: fb.updatedAt,
  };
};

module.exports = { feedbackDto };
