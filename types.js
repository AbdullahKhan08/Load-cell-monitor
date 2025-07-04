// Yes, and these will live in a single types.js (JS now, TypeScript later) to enforce consistency across:

// ✅ testMetadata
// ✅ Chart data structure
// ✅ Modbus connection config
// ✅ Settings (logo, company name, etc.)

/**
 * @typedef {Object} TestMetadata
 * @property {string} loadCellPartNo
 * @property {string} loadCellSerialNo
 * @property {string} loadCellModelNo
 * @property {string} loadCellLastCalibrationDate
 * @property {string} loadCellCalibrationValidity
 * @property {string} displayPartNo
 * @property {string} displayModelNo
 * @property {string} displaySerialNo
 * @property {string} displayLastCalibrationDate
 * @property {string} displayCalibrationValidity
 * @property {string} equipmentName
 * @property {string} typeOfEquipment
 * @property {string} equipmentPartNo
 * @property {string} equipmentModelNo
 * @property {string} equipmentSerialNo
 * @property {string} ratedLoadCapacity
 * @property {string} yearOfManufacture
 * @property {string} location
 * @property {string} testedBy
 * @property {string} certifiedBy
 * @property {string} [proofLoad]
 * @property {string} [certificateValidity]
 */

/**
 * @typedef {Object} ChartPoint
 * @property {string} time
 * @property {number} loadTons
//  * @property {number} loadKN
 */
