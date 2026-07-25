"use client";
// Client binding for the evaluation services. All logic lives in core.mjs so the Node test
// suite exercises exactly the same code the browser runs.

import { makeEval } from "./core.mjs";
import { RULES, OPS } from "./squad";

const evaluators = makeEval(RULES, OPS);

export const projectedPoints = evaluators.projectedPoints;
export const captaincy = evaluators.captaincy;
export const riskFlags = evaluators.riskFlags;
export const structureReadout = evaluators.structureReadout;
export const evaluateSquad = evaluators.evaluateSquad;
export const replacements = evaluators.replacements;
export const hitWorthIt = evaluators.hitWorthIt;
