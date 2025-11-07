const Mapping = require('../models/Mapping');

exports.getAllMappings = async (req, res) => {
  try {
    const mappings = await Mapping.find()
      .populate('sectionRef')
      .populate('subjectRef')
      .populate('facultyRef')
      .sort({ sectionRef: 1 });
    res.json(mappings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createMapping = async (req, res) => {
  try {
    const mapping = new Mapping(req.body);
    await mapping.save();
    await mapping.populate('sectionRef subjectRef facultyRef');
    res.status(201).json(mapping);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteMapping = async (req, res) => {
  try {
    const mapping = await Mapping.findByIdAndDelete(req.params.id);
    if (!mapping) {
      return res.status(404).json({ error: 'Mapping not found' });
    }
    res.json({ message: 'Mapping deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

