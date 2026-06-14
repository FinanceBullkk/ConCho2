const CustomFieldDefinition = require('../../models/CustomFieldDefinition');

// custom-field/repository — all Mongoose access for custom field definitions.

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

module.exports = { list, create, findByIdLean, updateById, softDelete };
