import express from "express";
import { db } from "../db/index.js";
import { and, eq, getTableColumns, ilike, notInArray } from "drizzle-orm";
import { students, enrollments } from "../schema/app.js";
import { user } from "../schema/auth.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { search, excludeClassId } = req.query;

    const filterConditions = [];
    if (search) filterConditions.push(ilike(user.name, `%${search}%`));

    if (excludeClassId) {
      const enrolledStudentIds = await db
        .select({ studentId: enrollments.studentId })
        .from(enrollments)
        .where(eq(enrollments.classId, Number(excludeClassId)));
      const ids = enrolledStudentIds.map((row) => row.studentId);
      if (ids.length > 0) filterConditions.push(notInArray(students.id, ids));
    }

    const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

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
      .innerJoin(user, eq(students.userId, user.id))
      .where(whereClause);

    res.json({ data: studentsList });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching students" });
  }
});

export default router;
