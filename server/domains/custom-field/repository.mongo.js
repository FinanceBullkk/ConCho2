const CustomFieldDefinition = require('../../models/CustomFieldDefinition');

// custom-field/repository — MONGO impl. All Mongoose access for custom field definitions.

const list = ({ entity } = {}) => {
  const filter = { isDeleted: false };
  if (entity) filter.entity = entity;
  return CustomFieldDefinition.find(filter).sort({ entity: 1, order: 1, createdAt: 1 }).lean();
};

const create = (data) => CustomFieldDefinition.create(data);

const findByIdLean = (id) => CustomFieldDefinition.findOne({ _id: id, isDeleted: false }).lean();

const updateById = (id, data) =>
  CustomFieldDefinition.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();

const softDelete = (id) =>
  CustomFieldDefinition.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  ).lean();

// Persist a new display order: each id's `order` becomes its index in the list.
// One bulkWrite = atomic-enough per document, no transaction/replica-set needed.
// The `entity` in the filter guarantees a payload can only touch that entity's
// own fields, never reach across entities.
const reorder = (entity, orderedIds) =>
  CustomFieldDefinition.bulkWrite(
    orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, entity, isDeleted: false },
        update: { $set: { order: index } },
      },
    })),
  );

module.exports = { list, create, findByIdLean, updateById, softDelete, reorder };
