import test from "node:test";
import assert from "node:assert/strict";
import { activitySchema, candidateSchema, statusSchema } from "./validation.js";

test("activity requires title, topic and positive planned hours", () => {
  assert.equal(activitySchema.safeParse({ title: "React", topic: "Frontend", plannedHours: 4 }).success, true);
  assert.equal(activitySchema.safeParse({ title: "", topic: "Frontend", plannedHours: 4 }).success, false);
  assert.equal(activitySchema.safeParse({ title: "React", topic: "Frontend", plannedHours: 0 }).success, false);
});

test("candidate requires a valid email and cohort", () => {
  assert.equal(candidateSchema.safeParse({ name: "Jordan Lee", email: "jordan@example.test", cohort: "Frontend" }).success, true);
  assert.equal(candidateSchema.safeParse({ name: "Jordan Lee", email: "not-an-email", cohort: "Frontend" }).success, false);
});

test("assignment status accepts only the three specified states", () => {
  for (const status of ["Not Started", "In Progress", "Completed"]) {
    assert.equal(statusSchema.safeParse({ status }).success, true);
  }
  assert.equal(statusSchema.safeParse({ status: "Started" }).success, false);
});
