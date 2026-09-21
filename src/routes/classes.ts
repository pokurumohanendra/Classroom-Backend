import express from "express";
import { db } from "../db";
import { sql, and, eq, or, ilike, desc, getTableColumns } from "drizzle-orm";
import { classes, subjects, teachers } from "../schema/app";
import { user } from "../schema/auth";
import { requireAuth, requireRole } from "../middleware/require-auth";

const router = express.Router();

const classSelection = {
  ...getTableColumns(classes),
  subject: { ...getTableColumns(subjects) },
  teacher: { ...getTableColumns(teachers) },
  teacherUserId: user.id,
  teacherUserName: user.name,
  teacherUserEmail: user.email,
};

const classQuery = () =>
  db
    .select(classSelection)
    .from(classes)
    .leftJoin(subjects, eq(classes.subjectId, subjects.id))
    .leftJoin(teachers, eq(classes.teacherId, teachers.id))
    .leftJoin(user, eq(teachers.userId, user.id));

// Drizzle's .select() only nests one level deep, so the teacher's linked user
// is selected as flat teacherUser* columns above and reassembled here.
const mapClassRow = (row: Awaited<ReturnType<typeof classQuery>>[number]) => {
  const { teacherUserId, teacherUserName, teacherUserEmail, teacher, ...rest } = row;
  return {
    ...rest,
    teacher: teacher && {
      ...teacher,
      user: teacherUserId ? { id: teacherUserId, name: teacherUserName, email: teacherUserEmail } : null,
    },
  };
};

router.get("/", requireAuth, async (req, res) => {
  try {
    const { search, status, subjectId, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (search) {
      filterConditions.push(
        or(
          ilike(classes.name, `%${search}%`),
          ilike(classes.inviteCode, `%${search}%`)
        )
      );
    }
    if (status) {
      filterConditions.push(eq(classes.status, String(status)));
    }
    if (subjectId) {
      filterConditions.push(eq(classes.subjectId, Number(subjectId)));
    }
    const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .where(whereClause);
    const totalCount = countResult[0]?.count || 0;

    const classesList = await classQuery()
      .where(whereClause)
      .orderBy(desc(classes.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.json({
      data: classesList.map(mapClassRow),
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching classes" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await classQuery().where(eq(classes.id, id));
    if (!result[0]) return res.status(404).json({ error: "Class not found" });
    res.json({ data: mapClassRow(result[0]) });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching class" });
  }
});

router.post("/", requireAuth, requireRole("admin", "teacher"), async (req, res) => {
  try {
    const { name, inviteCode, subjectId, teacherId, description, bannerUrl, bannerCldPubId, capacity, status } = req.body;

    if (!name || !inviteCode || !subjectId || !teacherId) {
      return res.status(400).json({ error: "name, inviteCode, subjectId and teacherId are required" });
    }

    const [created] = await db
      .insert(classes)
      .values({ name, inviteCode, subjectId, teacherId, description, bannerUrl, bannerCldPubId, capacity, status })
      .returning({ id: classes.id });

    if (!created) throw new Error("Insert returned no row");

    const result = await classQuery().where(eq(classes.id, created.id));
    res.status(201).json({ data: mapClassRow(result[0]!) });
  } catch (err: any) {
    if ((err?.cause?.code ?? err?.code) === "23505") {
      return res.status(409).json({ error: "Invite code already exists" });
    }
    res.status(500).json({ error: "Error occurred while creating class" });
  }
});

router.put("/:id", requireAuth, requireRole("admin", "teacher"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, inviteCode, subjectId, teacherId, description, bannerUrl, bannerCldPubId, capacity, status } = req.body;

    const [updated] = await db
      .update(classes)
      .set({ name, inviteCode, subjectId, teacherId, description, bannerUrl, bannerCldPubId, capacity, status })
      .where(eq(classes.id, id))
      .returning({ id: classes.id });

    if (!updated) return res.status(404).json({ error: "Class not found" });

    const result = await classQuery().where(eq(classes.id, updated.id));
    res.json({ data: mapClassRow(result[0]!) });
  } catch (err: any) {
    if ((err?.cause?.code ?? err?.code) === "23505") {
      return res.status(409).json({ error: "Invite code already exists" });
    }
    res.status(500).json({ error: "Error occurred while updating class" });
  }
});

router.delete("/:id", requireAuth, requireRole("admin", "teacher"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(classes)
      .where(eq(classes.id, id))
      .returning({ id: classes.id });

    if (!deleted) return res.status(404).json({ error: "Class not found" });
    res.json({ message: "Class deleted" });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while deleting class" });
  }
});

export default router;
