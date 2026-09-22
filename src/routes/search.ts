import express from "express";
import { db } from "../db/index.js";
import { and, or, ilike, eq } from "drizzle-orm";
import { classes, subjects, departments, teachers } from "../schema/app.js";
import { user } from "../schema/auth.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q.length) {
      return res.json({ data: { users: [], departments: [], subjects: [], classes: [] } });
    }

    const pattern = `%${q}%`;
    const isTeacher = req.user!.role === "teacher";

    let teacherId: number | undefined;
    if (isTeacher) {
      const [teacherRow] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, req.user!.id));
      teacherId = teacherRow?.id;
    }

    const classConditions = [or(ilike(classes.name, pattern), ilike(classes.inviteCode, pattern))!];
    if (isTeacher) classConditions.push(eq(classes.teacherId, teacherId ?? -1));

    const [usersResult, departmentsResult, subjectsResult, classesResult] = await Promise.all([
      req.user!.role === "admin"
        ? db
            .select({ id: user.id, label: user.name, sublabel: user.email })
            .from(user)
            .where(or(ilike(user.name, pattern), ilike(user.email, pattern)))
            .limit(5)
        : Promise.resolve([]),
      db
        .select({ id: departments.id, label: departments.name, sublabel: departments.code })
        .from(departments)
        .where(or(ilike(departments.name, pattern), ilike(departments.code, pattern)))
        .limit(5),
      db
        .select({ id: subjects.id, label: subjects.name, sublabel: subjects.code })
        .from(subjects)
        .where(or(ilike(subjects.name, pattern), ilike(subjects.code, pattern)))
        .limit(5),
      db
        .select({ id: classes.id, label: classes.name, sublabel: classes.inviteCode })
        .from(classes)
        .where(and(...classConditions))
        .limit(5),
    ]);

    res.json({
      data: {
        users: usersResult.map((row) => ({ ...row, resource: "users" })),
        departments: departmentsResult.map((row) => ({ ...row, resource: "departments" })),
        subjects: subjectsResult.map((row) => ({ ...row, resource: "subjects" })),
        classes: classesResult.map((row) => ({ ...row, resource: "classes" })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while searching" });
  }
});

export default router;
