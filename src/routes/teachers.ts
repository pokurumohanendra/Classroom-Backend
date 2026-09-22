import express from "express";
import { db } from "../db/index.js";
import { eq, getTableColumns } from "drizzle-orm";
import { teachers } from "../schema/app.js";
import { user } from "../schema/auth.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {
  try {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, req.user!.id));
    if (!teacher) return res.status(404).json({ error: "Not a teacher" });
    res.json({ data: teacher });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching teacher profile" });
  }
});

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
