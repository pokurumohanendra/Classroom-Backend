import express from "express";
import { db } from "../db";
import { eq, getTableColumns } from "drizzle-orm";
import { teachers } from "../schema/app";
import { user } from "../schema/auth";
import { requireAuth } from "../middleware/require-auth";

const router = express.Router();

router.get("/", requireAuth, async (_req, res) => {
  try {
    const teachersList = await db
      .select({
        ...getTableColumns(teachers),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      })
      .from(teachers)
      .innerJoin(user, eq(teachers.userId, user.id));

    res.json({ data: teachersList });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching teachers" });
  }
});

export default router;
