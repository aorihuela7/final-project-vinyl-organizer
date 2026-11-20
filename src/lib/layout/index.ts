/**
 * The layout algorithm: pure TypeScript, no Next or Supabase imports.
 * See docs/algorithm.md for the explanation and a worked example.
 */
export * from "./types";
export { DEFAULT_ARTICLES, displayArtist, normalizeArtist, stripArticle, stripDisambiguation, NO_GENRE } from "./normalize";
export { compareRecords, sortRecords, sortKeyOf } from "./sort";
export { traverse, positionKey } from "./traversal";
export { distribute, distributeWeighted, initialLayout, type LayoutResult, type GroupLayout } from "./initial";
export { insertRecord, insertMany, collapseMoves, type ShelfState, type InsertResult, type InsertStrategy } from "./insert";
export { simulatePurchases, type SimulationResult, type SimulationOptions } from "./simulate";
export { calibrate, calibrateCount, type CalibrateResult, type CalibrateRefusal } from "./calibrate";
export { buildIndex, locate, positionInCompartment, countChanges, type ShelfIndex, type Location, type Neighbor } from "./query";
export { abbreviate, rangeLabels, spineColors, type RangeLabel } from "./ranges";
