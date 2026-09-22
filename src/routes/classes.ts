import express from "express";
import { db } from "../db/index.js";
import { sql, and, eq, or, ilike, desc, getTableColumns } from "drizzle-orm";
import { classes, subjects, teachers, enrollments } from "../schema/app.js";
import { user } from "../schema/auth.js";
import { requireAuth, requireRole } from "../middleware/require-auth.js";

const router = express.Router();

const classSelection = {
  ...getTableColumns(classes),
  subject: { ...getTableColumns(subjects) },
  teacher: { ...getTableColumns(teachers) },
  teacherUserId: user.id,
  teacherUserName: user.name,
  teacherUserEmail: user.email,
  enrolledCount: sql<number>`count(distinct ${enrollments.id})`,
};

const baseClassQuery = () =>
  db
    .select(classSelection)
    .from(classes)
    .leftJoin(subjects, eq(classes.subjectId, subjects.id))
    .leftJoin(teachers, eq(classes.teacherId, teachers.id))
    .leftJoin(user, eq(teachers.userId, user.id))
    .leftJoin(enrollments, eq(enrollments.classId, classes.id));

// Drizzle's .select() only nests one level deep, so the teacher's linked user
// is selected as flat teacherUser* columns above and reassembled here.
const mapClassRow = (row: Awaited<ReturnType<typeof baseClassQuery>>[number]) => {
  const { teacherUserId, teacherUserName, teacherUserEmail, teacher, enrolledCount, ...rest } = row;
  return {
    ...rest,
    enrolledCount: Number(enrolledCount ?? 0),
    teacher: teacher && {
      ...teacher,
      user: teacherUserId ? { id: teacherUserId, name: teacherUserName, email: teacherUserEmail } : null,
    },
  };
};

// A class's teacher is resolved through a teachers profile row, not `user`
// directly (see schema/app.ts) -- this looks up the caller's own teacher id
// and checks it against a class's teacherId for the "teachers manage only
// their own classes" scoping rule.
const assertClassOwnership = async (
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
    res.status(403).json({ error: "You can only manage your own classes" });
    return false;
  }
  return true;
};

router.get("/", requireAuth, async (req, res) => {
  try {
    const { search, status, subjectId, teacherId, capacityStatus, page = 1, limit = 10 } = req.query;

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
    if (teacherId) {
      filterConditions.push(eq(classes.teacherId, Number(teacherId)));
    }
    const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    let havingClause;
    if (capacityStatus === "available") {
      havingClause = sql`count(distinct ${enrollments.id}) < ${classes.capacity} * 0.8`;
    } else if (capacityStatus === "nearFull") {
      havingClause = sql`count(distinct ${enrollments.id}) >= ${classes.capacity} * 0.8 AND count(distinct ${enrollments.id}) < ${classes.capacity}`;
    } else if (capacityStatus === "full") {
      havingClause = sql`count(distinct ${enrollments.id}) >= ${classes.capacity}`;
    }

    let totalCount: number;
    if (havingClause) {
      const countRows = await db
        .select({ id: classes.id })
        .from(classes)
        .leftJoin(enrollments, eq(enrollments.classId, classes.id))
        .where(whereClause)
        .groupBy(classes.id)
        .having(havingClause);
      totalCount = countRows.length;
    } else {
      const countResult = await db.select({ count: sql<number>`count(*)` }).from(classes).where(whereClause);
      totalCount = countResult[0]?.count || 0;
    }

    const groupedQuery = baseClassQuery()
      .where(whereClause)
      .groupBy(classes.id, subjects.id, teachers.id, user.id);

    const classesList = havingClause
      ? await groupedQuery.having(havingClause).orderBy(desc(classes.createdAt)).limit(limitPerPage).offset(offset)
      : await groupedQuery.orderBy(desc(classes.createdAt)).limit(limitPerPage).offset(offset);

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
    const result = await baseClassQuery()
      .where(eq(classes.id, id))
      .groupBy(classes.id, subjects.id, teachers.id, user.id);
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

    if (req.user!.role === "teacher") {
      const [teacherRow] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, req.user!.id));
      if (!teacherRow || teacherRow.id !== Number(teacherId)) {
        return res.status(403).json({ error: "Teachers can only create classes for themselves" });
      }
    }

    const [created] = await db
      .insert(classes)
      .values({ name, inviteCode, subjectId, teacherId, description, bannerUrl, bannerCldPubId, capacity, status })
      .returning({ id: classes.id });

    if (!created) throw new Error("Insert returned no row");

    const result = await baseClassQuery()
      .where(eq(classes.id, created.id))
      .groupBy(classes.id, subjects.id, teachers.id, user.id);
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
    if (!(await assertClassOwnership(req, res, id))) return;

    const { name, inviteCode, subjectId, teacherId, description, bannerUrl, bannerCldPubId, capacity, status } = req.body;

    const [updated] = await db
      .update(classes)
      .set({ name, inviteCode, subjectId, teacherId, description, bannerUrl, bannerCldPubId, capacity, status })
      .where(eq(classes.id, id))
      .returning({ id: classes.id });

    if (!updated) return res.status(404).json({ error: "Class not found" });

    const result = await baseClassQuery()
      .where(eq(classes.id, updated.id))
      .groupBy(classes.id, subjects.id, teachers.id, user.id);
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
    if (!(await assertClassOwnership(req, res, id))) return;

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
