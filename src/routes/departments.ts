import express from "express";
import { db } from "../db/index.js";
import { sql, and, eq, or, ilike, asc, getTableColumns } from "drizzle-orm";
import { departments, subjects, classes, enrollments } from "../schema/app.js";
import { requireAuth, requireRole } from "../middleware/require-auth.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];
    if (search) {
      filterConditions.push(
        or(ilike(departments.name, `%${search}%`), ilike(departments.code, `%${search}%`))
      );
    }
    const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(departments)
      .where(whereClause);
    const totalCount = countResult[0]?.count || 0;

    const departmentsList = await db
      .select({
        ...getTableColumns(departments),
        totalSubjects: sql<number>`count(${subjects.id})`,
      })
      .from(departments)
      .leftJoin(subjects, eq(subjects.departmentId, departments.id))
      .where(whereClause)
      .groupBy(departments.id)
      .orderBy(asc(departments.name))
      .limit(limitPerPage)
      .offset(offset);

    res.json({
      data: departmentsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching departments" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [department] = await db.select().from(departments).where(eq(departments.id, id));
    if (!department) return res.status(404).json({ error: "Department not found" });

    const [subjectsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .where(eq(subjects.departmentId, id));

    const [classesCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .innerJoin(subjects, eq(classes.subjectId, subjects.id))
      .where(eq(subjects.departmentId, id));

    const [enrolledCount] = await db
      .select({ count: sql<number>`count(distinct ${enrollments.studentId})` })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .innerJoin(subjects, eq(classes.subjectId, subjects.id))
      .where(eq(subjects.departmentId, id));

    res.json({
      data: {
        department,
        totals: {
          subjects: Number(subjectsCount?.count ?? 0),
          classes: Number(classesCount?.count ?? 0),
          enrolledStudents: Number(enrolledCount?.count ?? 0),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching department" });
  }
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { code, name, description } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: "code and name are required" });
    }

    const [created] = await db
      .insert(departments)
      .values({ code, name, description })
      .returning();

    res.status(201).json({ data: created });
  } catch (err: any) {
    if ((err?.cause?.code ?? err?.code) === "23505") {
      return res.status(409).json({ error: "Department code already exists" });
    }
    res.status(500).json({ error: "Error occurred while creating department" });
  }
});

router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { code, name, description } = req.body;

    const [updated] = await db
      .update(departments)
      .set({ code, name, description })
      .where(eq(departments.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Department not found" });
    res.json({ data: updated });
  } catch (err: any) {
    if ((err?.cause?.code ?? err?.code) === "23505") {
      return res.status(409).json({ error: "Department code already exists" });
    }
    res.status(500).json({ error: "Error occurred while updating department" });
  }
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(departments)
      .where(eq(departments.id, id))
      .returning({ id: departments.id });

    if (!deleted) return res.status(404).json({ error: "Department not found" });
    res.json({ message: "Department deleted" });
  } catch (err: any) {
    // A RESTRICT-on-delete FK (subjects.departmentId here) surfaces as
    // Postgres error 23001 (restrict_violation), not the more common 23503
    // (foreign_key_violation) raised by ON DELETE's default NO ACTION.
    if (["23001", "23503"].includes(err?.cause?.code ?? err?.code)) {
      return res.status(409).json({ error: "Cannot delete a department that still has subjects" });
    }
    res.status(500).json({ error: "Error occurred while deleting department" });
  }
});

export default router;
