import express from "express";
import { db } from "../db/index.js";
import { eq, getTableColumns } from "drizzle-orm";
import { students } from "../schema/app.js";
import { user } from "../schema/auth.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = express.Router();

router.get("/", requireAuth, async (_req, res) => {
  try {
    const studentsList = await db
      .select({
        ...getTableColumns(students),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      })
      .from(students)
      .innerJoin(user, eq(students.userId, user.id));

    res.json({ data: studentsList });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching students" });
  }
});

export default router;
