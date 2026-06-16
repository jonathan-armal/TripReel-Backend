/**
 * Escape user-input for safe use in MongoDB $regex.
 * Prevents ReDoS and unintended pattern matching.
 */
module.exports = function escapeRegex(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
