import express from "express";
import { db } from "../db";
import { asc } from "drizzle-orm";
import { departments } from "../schema/app";
import { requireAuth } from "../middleware/require-auth";

const router = express.Router();

router.get("/", requireAuth, async (_req, res) => {
  try {
    const departmentsList = await db
      .select()
      .from(departments)
      .orderBy(asc(departments.name));

    res.json({ data: departmentsList });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching departments" });
  }
});

export default router;
