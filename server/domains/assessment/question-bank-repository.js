const AssessmentQuestion = require('../../models/AssessmentQuestion');

const createQuestion = async (data) => {
  const doc = await AssessmentQuestion.create(data);
  return doc.toObject();
};

const findQuestionById = (id) =>
  AssessmentQuestion.findOne({ _id: id, isDeleted: false }).lean();

const updateQuestion = (id, data) =>
  AssessmentQuestion.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();

const listQuestions = ({ programId, cohortId, type, tag, q }) => {
  const filter = { isDeleted: false };
  if (programId) filter.programId = programId;
  if (cohortId) filter.cohortId = cohortId;
  if (type) filter.type = type;
  if (tag) filter.tags = tag;
  if (q) filter.prompt = { $regex: q, $options: 'i' };
  return AssessmentQuestion.find(filter).sort({ updatedAt: -1 }).lean();
};

const softDeleteQuestion = (id) =>
  AssessmentQuestion.findByIdAndUpdate(
    id,
    { isDeleted: true, deletedAt: new Date() },
    { new: true },
  ).lean();

module.exports = {
  createQuestion,
  findQuestionById,
  updateQuestion,
  listQuestions,
  softDeleteQuestion,
};
