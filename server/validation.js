import { z } from "zod";

export const activitySchema = z.object({
  title: z.string().trim().min(2).max(100),
  topic: z.string().trim().min(2).max(60),
  plannedHours: z.coerce.number().positive().max(1000),
});

export const candidateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  cohort: z.string().trim().min(2).max(80),
});

export const statusSchema = z.object({
  status: z.enum(["Not Started", "In Progress", "Completed"]),
});
