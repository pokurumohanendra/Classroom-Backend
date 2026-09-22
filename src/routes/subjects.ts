import express from "express";
import { db } from "../db/index.js";
import { sql, and, eq, or, ilike, desc, getTableColumns } from "drizzle-orm";
import { departments, subjects, classes } from "../schema/app.js";
import { requireAuth, requireRole } from "../middleware/require-auth.js";
const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { search, department, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);

    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (search) {
      filterConditions.push(
        or(
          ilike(subjects.name, `%${search}%`),
          ilike(subjects.code, `%${search}%`)
        )
      );
    }
    if (department) {
      const deptPattern = `%${String(department).replace(/[%_]/g, "\\$&")}%`;
      filterConditions.push(ilike(departments.name, deptPattern));
    }
    const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause);
    const totalCount = countResult[0]?.count || 0;

    const subjectsList = await db
      .select({
        ...getTableColumns(subjects),
        department: { ...getTableColumns(departments) },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause)
      .orderBy(desc(subjects.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.json({
      data: subjectsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages:Math.ceil(totalCount /limitPerPage),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching subjects" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [result] = await db
      .select({
        ...getTableColumns(subjects),
        department: { ...getTableColumns(departments) },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(eq(subjects.id, id));

    if (!result) return res.status(404).json({ error: "Subject not found" });

    const [classesCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .where(eq(classes.subjectId, id));

    res.json({ data: { ...result, totalClasses: Number(classesCount?.count ?? 0) } });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching subject" });
  }
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { departmentId, name, code, description } = req.body;
    if (!departmentId || !name || !code) {
      return res.status(400).json({ error: "departmentId, name and code are required" });
    }

    const [created] = await db
      .insert(subjects)
      .values({ departmentId, name, code, description })
      .returning({ id: subjects.id });

    if (!created) throw new Error("Insert returned no row");

    const [result] = await db
      .select({
        ...getTableColumns(subjects),
        department: { ...getTableColumns(departments) },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(eq(subjects.id, created.id));

    res.status(201).json({ data: result });
  } catch (err: any) {
    if ((err?.cause?.code ?? err?.code) === "23505") {
      return res.status(409).json({ error: "Subject code already exists" });
    }
    if ((err?.cause?.code ?? err?.code) === "23503") {
      return res.status(400).json({ error: "Department not found" });
    }
    res.status(500).json({ error: "Error occurred while creating subject" });
  }
});

router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { departmentId, name, code, description } = req.body;

    const [updated] = await db
      .update(subjects)
      .set({ departmentId, name, code, description })
      .where(eq(subjects.id, id))
      .returning({ id: subjects.id });

    if (!updated) return res.status(404).json({ error: "Subject not found" });

    const [result] = await db
      .select({
        ...getTableColumns(subjects),
        department: { ...getTableColumns(departments) },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(eq(subjects.id, updated.id));

    res.json({ data: result });
  } catch (err: any) {
    if ((err?.cause?.code ?? err?.code) === "23505") {
      return res.status(409).json({ error: "Subject code already exists" });
    }
    if ((err?.cause?.code ?? err?.code) === "23503") {
      return res.status(400).json({ error: "Department not found" });
    }
    res.status(500).json({ error: "Error occurred while updating subject" });
  }
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(subjects)
      .where(eq(subjects.id, id))
      .returning({ id: subjects.id });

    if (!deleted) return res.status(404).json({ error: "Subject not found" });
    res.json({ message: "Subject deleted" });
  } catch (err: any) {
    // See departments.ts's DELETE handler: RESTRICT FKs raise 23001, not 23503.
    if (["23001", "23503"].includes(err?.cause?.code ?? err?.code)) {
      return res.status(409).json({ error: "Cannot delete a subject that still has classes" });
    }
    res.status(500).json({ error: "Error occurred while deleting subject" });
  }
});

export default router;
