import express from "express";
import { db } from "../db/index.js";
import { sql, and, eq, getTableColumns } from "drizzle-orm";
import { enrollments, classes, students, teachers } from "../schema/app.js";
import { user } from "../schema/auth.js";
import { requireAuth, requireRole } from "../middleware/require-auth.js";

const router = express.Router();

const findStudentIdForUser = async (userId: string) => {
  const [row] = await db.select({ id: students.id }).from(students).where(eq(students.userId, userId));
  return row?.id;
};

// Mirrors classes.ts's ownership check: a teacher may only manage
// enrollments for classes they themselves teach.
const assertClassOwnershipForEnrollment = async (
  req: express.Request,
  res: express.Response,
  classId: number
): Promise<boolean> => {
  if (req.user!.role !== "teacher") return true;

  const [teacherRow] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, req.user!.id));
  const [classRow] = await db.select({ teacherId: classes.teacherId }).from(classes).where(eq(classes.id, classId));

  if (!classRow) {
    res.status(404).json({ error: "Class not found" });
    return false;
  }
  if (!teacherRow || classRow.teacherId !== teacherRow.id) {
    res.status(403).json({ error: "You can only manage enrollments for your own classes" });
    return false;
  }
  return true;
};

const enrollmentSelection = {
  ...getTableColumns(enrollments),
  student: { ...getTableColumns(students) },
  studentUserId: user.id,
  studentUserName: user.name,
  studentUserEmail: user.email,
};

const enrollmentQuery = () =>
  db
    .select(enrollmentSelection)
    .from(enrollments)
    .leftJoin(students, eq(enrollments.studentId, students.id))
    .leftJoin(user, eq(students.userId, user.id));

const mapEnrollmentRow = (row: Awaited<ReturnType<typeof enrollmentQuery>>[number]) => {
  const { studentUserId, studentUserName, studentUserEmail, student, ...rest } = row;
  return {
    ...rest,
    student: student && {
      ...student,
      user: studentUserId ? { id: studentUserId, name: studentUserName, email: studentUserEmail } : null,
    },
  };
};

router.get("/", requireAuth, async (req, res) => {
  try {
    const { classId, studentId, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];
    if (classId) filterConditions.push(eq(enrollments.classId, +classId));
    if (studentId) filterConditions.push(eq(enrollments.studentId, +studentId));
    const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(whereClause);
    const totalCount = countResult[0]?.count || 0;

    const enrollmentsList = await enrollmentQuery()
      .where(whereClause)
      .orderBy(enrollments.enrolledAt)
      .limit(limitPerPage)
      .offset(offset);

    res.json({
      data: enrollmentsList.map(mapEnrollmentRow),
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching enrollments" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const result = await enrollmentQuery().where(eq(enrollments.id, Number(req.params.id)));
    if (!result[0]) return res.status(404).json({ error: "Enrollment not found" });
    res.json({ data: mapEnrollmentRow(result[0]) });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching enrollment" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { classId } = req.body;
    if (!classId) return res.status(400).json({ error: "classId is required" });

    let studentId: number | undefined;

    if (req.user!.role === "admin" || req.user!.role === "teacher") {
      studentId = req.body.studentId;
      if (!studentId) return res.status(400).json({ error: "studentId is required" });
      if (!(await assertClassOwnershipForEnrollment(req, res, classId))) return;
    } else {
      studentId = await findStudentIdForUser(req.user!.id);
      if (!studentId) return res.status(403).json({ error: "Only students can enroll in a class" });
    }

    const [created] = await db
      .insert(enrollments)
      .values({ classId, studentId })
      .returning();
    res.status(201).json({ data: created });
  } catch (err: any) {
    if ((err?.cause?.code ?? err?.code) === "23505") {
      return res.status(409).json({ error: "Already enrolled in this class" });
    }
    if ((err?.cause?.code ?? err?.code) === "23503") {
      return res.status(404).json({ error: "Class or student not found" });
    }
    res.status(500).json({ error: "Error occurred while creating enrollment" });
  }
});

router.post("/join", requireAuth, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: "inviteCode is required" });

    const [classRow] = await db.select({ id: classes.id }).from(classes).where(eq(classes.inviteCode, inviteCode));
    if (!classRow) return res.status(404).json({ error: "Class not found" });

    const studentId = await findStudentIdForUser(req.user!.id);
    if (!studentId) return res.status(403).json({ error: "Only students can enroll in a class" });

    const [created] = await db
      .insert(enrollments)
      .values({ classId: classRow.id, studentId })
      .returning();
    res.status(201).json({ data: created });
  } catch (err: any) {
    if ((err?.cause?.code ?? err?.code) === "23505") {
      return res.status(409).json({ error: "Already enrolled in this class" });
    }
    res.status(500).json({ error: "Error occurred while joining class" });
  }
});

router.put("/:id", requireAuth, requireRole("admin", "teacher"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select({ classId: enrollments.classId }).from(enrollments).where(eq(enrollments.id, id));
    if (!existing) return res.status(404).json({ error: "Enrollment not found" });
    if (!(await assertClassOwnershipForEnrollment(req, res, existing.classId))) return;

    const { classId, studentId } = req.body;
    if (classId && classId !== existing.classId && !(await assertClassOwnershipForEnrollment(req, res, classId))) return;

    const [updated] = await db
      .update(enrollments)
      .set({ classId, studentId })
      .where(eq(enrollments.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Enrollment not found" });
    res.json({ data: updated });
  } catch (err: any) {
    if ((err?.cause?.code ?? err?.code) === "23505") {
      return res.status(409).json({ error: "Student already enrolled in class" });
    }
    res.status(500).json({ error: "Error occurred while updating enrollment" });
  }
});

router.delete("/:id", requireAuth, requireRole("admin", "teacher"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select({ classId: enrollments.classId }).from(enrollments).where(eq(enrollments.id, id));
    if (!existing) return res.status(404).json({ error: "Enrollment not found" });
    if (!(await assertClassOwnershipForEnrollment(req, res, existing.classId))) return;

    const [deleted] = await db
      .delete(enrollments)
      .where(eq(enrollments.id, id))
      .returning({ id: enrollments.id });

    if (!deleted) return res.status(404).json({ error: "Enrollment not found" });
    res.json({ message: "Enrollment deleted" });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while deleting enrollment" });
  }
});

export default router;
