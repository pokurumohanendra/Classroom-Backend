import express from "express";
import { db } from "../db";
import { sql, and, eq, getTableColumns } from "drizzle-orm";
import { enrollments, classes, students } from "../schema/app";
import { requireAuth, requireRole } from "../middleware/require-auth";

const router = express.Router();

const findStudentIdForUser = async (userId: string) => {
  const [row] = await db.select({ id: students.id }).from(students).where(eq(students.userId, userId));
  return row?.id;
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

    const enrollmentsList = await db
      .select(getTableColumns(enrollments))
      .from(enrollments)
      .where(whereClause)
      .orderBy(enrollments.enrolledAt)
      .limit(limitPerPage)
      .offset(offset);

    res.json({
      data: enrollmentsList,
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
    const [result] = await db.select().from(enrollments).where(eq(enrollments.id, Number(req.params.id)));
    if (!result) return res.status(404).json({ error: "Enrollment not found" });
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching enrollment" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { classId } = req.body;
    if (!classId) return res.status(400).json({ error: "classId is required" });

    const studentId = await findStudentIdForUser(req.user!.id);
    if (!studentId) return res.status(403).json({ error: "Only students can enroll in a class" });

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
      return res.status(404).json({ error: "Class not found" });
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
    const { classId, studentId } = req.body;

    const [updated] = await db
      .update(enrollments)
      .set({ classId, studentId })
      .where(eq(enrollments.id, Number(req.params.id)))
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
    const [deleted] = await db
      .delete(enrollments)
      .where(eq(enrollments.id, Number(req.params.id)))
      .returning({ id: enrollments.id });

    if (!deleted) return res.status(404).json({ error: "Enrollment not found" });
    res.json({ message: "Enrollment deleted" });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while deleting enrollment" });
  }
});

export default router;
