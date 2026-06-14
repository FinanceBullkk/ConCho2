// custom-field/dto — response shaping for a custom field definition.
const customFieldDto = (d) => {
  if (!d) return null;
  const o = typeof d.toObject === 'function' ? d.toObject() : d;
  return {
    _id: o._id,
    entity: o.entity,
    key: o.key,
    label: o.label,
    type: o.type,
    options: o.options || [],
    showIn: o.showIn && o.showIn.length ? o.showIn : ['form'],
    required: Boolean(o.required),
    order: o.order || 0,
  };
};

module.exports = { customFieldDto };
