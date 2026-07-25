"use client";
// Client binding: builds the ruleset limits once from config/rules-2026-27.json and exposes the
// pure ops from core.mjs under the names the UI uses. Nothing is hard-coded here.

import rulesJson from "../../config/rules-2026-27.json";
import { limitsFrom, makeOps } from "./core.mjs";

export const RULES = limitsFrom(rulesJson);
const ops = makeOps(RULES);

export const STRUCTURES = ops.STRUCTURES;
export const structureByKey = ops.structureByKey;
export const emptySquad = ops.emptySquad;
export const spend = ops.spend;
export const bank = ops.bank;
export const countPos = ops.countPos;
export const squadCountPos = ops.squadCountPos;
export const clubCount = ops.clubCount;
export const xi = ops.xi;
export const benchOf = ops.benchOf;
export const canAdd = ops.canAdd;
export const addPlayer = ops.addPlayer;
export const removePlayer = ops.removePlayer;
export const swapStarter = ops.swapStarter;
export const applyStructure = ops.applyStructure;
export const envelopeFor = ops.envelopeFor;
export const autoComplete = ops.autoComplete;
export const bestCaptain = ops.bestCaptain;
export const benchOrder = ops.benchOrder;
export const isComplete = ops.isComplete;
export const violations = ops.violations;
export const OPS = ops;
