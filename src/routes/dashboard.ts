import express from "express";
import { db } from "../db/index.js";
import { sql, eq, gte, and, desc } from "drizzle-orm";
import { classes, subjects, departments, enrollments, teachers, students } from "../schema/app.js";
import { user } from "../schema/auth.js";
import { requireAuth, requireRole } from "../middleware/require-auth.js";

const router = express.Router();

router.use(requireAuth, requireRole("admin", "teacher"));

const resolveTeacherId = async (userId: string) => {
  const [row] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, userId));
  return row?.id;
};

type ActivityRow = {
  type: "enrollment" | "class_created" | "user_created";
  id: number | string;
  label: string;
  detail: string;
  timestamp: Date;
};

router.get("/overview", async (req, res) => {
  try {
    const isTeacher = req.user!.role === "teacher";
    const teacherId = isTeacher ? await resolveTeacherId(req.user!.id) : undefined;
    const classScope = isTeacher ? eq(classes.teacherId, teacherId ?? -1) : undefined;

    const [totalDepartments] = await db.select({ count: sql<number>`count(*)` }).from(departments);
    const [totalSubjects] = await db.select({ count: sql<number>`count(*)` }).from(subjects);
    const [totalClasses] = await db.select({ count: sql<number>`count(*)` }).from(classes).where(classScope);

    const classesByStatus = await db
      .select({ status: classes.status, count: sql<number>`count(*)` })
      .from(classes)
      .where(classScope)
      .groupBy(classes.status);

    const [totalEnrollments] = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .where(classScope);

    const capacityRows = await db
      .select({ capacity: classes.capacity, enrolledCount: sql<number>`count(${enrollments.id})` })
      .from(classes)
      .leftJoin(enrollments, eq(enrollments.classId, classes.id))
      .where(classScope)
      .groupBy(classes.id, classes.capacity);

    const avgCapacityUtilization = capacityRows.length
      ? capacityRows.reduce(
          (sum, row) => sum + (row.capacity > 0 ? Number(row.enrolledCount) / row.capacity : 0),
          0
        ) / capacityRows.length
      : 0;

    const usersByRole = isTeacher
      ? null
      : (await db.select({ role: user.role, count: sql<number>`count(*)` }).from(user).groupBy(user.role)).map(
          (row) => ({ role: row.role, count: Number(row.count) })
        );

    res.json({
      data: {
        scope: isTeacher ? "teacher" : "admin",
        totalDepartments: Number(totalDepartments?.count ?? 0),
        totalSubjects: Number(totalSubjects?.count ?? 0),
        totalClasses: Number(totalClasses?.count ?? 0),
        classesByStatus: classesByStatus.map((row) => ({ status: row.status, count: Number(row.count) })),
        totalEnrollments: Number(totalEnrollments?.count ?? 0),
        avgCapacityUtilization,
        usersByRole,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching dashboard overview" });
  }
});

router.get("/charts", async (req, res) => {
  try {
    const isTeacher = req.user!.role === "teacher";
    const teacherId = isTeacher ? await resolveTeacherId(req.user!.id) : undefined;
    const classScope = isTeacher ? eq(classes.teacherId, teacherId ?? -1) : undefined;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const trendConditions = [gte(enrollments.enrolledAt, sixMonthsAgo)];
    if (classScope) trendConditions.push(classScope);

    const enrollmentTrends = await db
      .select({
        month: sql<string>`to_char(${enrollments.enrolledAt}, 'YYYY-MM')`,
        count: sql<number>`count(*)`,
      })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .where(and(...trendConditions))
      .groupBy(sql`to_char(${enrollments.enrolledAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${enrollments.enrolledAt}, 'YYYY-MM')`);

    const classesByDepartment = await db
      .select({
        department: departments.name,
        count: sql<number>`count(distinct ${classes.id})`,
      })
      .from(classes)
      .innerJoin(subjects, eq(classes.subjectId, subjects.id))
      .innerJoin(departments, eq(subjects.departmentId, departments.id))
      .where(classScope)
      .groupBy(departments.name)
      .orderBy(departments.name);

    const capacityRows = await db
      .select({ capacity: classes.capacity, enrolledCount: sql<number>`count(${enrollments.id})` })
      .from(classes)
      .leftJoin(enrollments, eq(enrollments.classId, classes.id))
      .where(classScope)
      .groupBy(classes.id, classes.capacity);

    const buckets = { available: 0, nearFull: 0, full: 0 };
    for (const row of capacityRows) {
      const ratio = row.capacity > 0 ? Number(row.enrolledCount) / row.capacity : 0;
      if (ratio >= 1) buckets.full++;
      else if (ratio >= 0.8) buckets.nearFull++;
      else buckets.available++;
    }

    const userDistribution = isTeacher
      ? [
          {
            role: "student",
            count: (
              await db
                .selectDistinct({ studentId: enrollments.studentId })
                .from(enrollments)
                .innerJoin(classes, eq(enrollments.classId, classes.id))
                .where(classScope)
            ).length,
          },
        ]
      : (await db.select({ role: user.role, count: sql<number>`count(*)` }).from(user).groupBy(user.role)).map(
          (row) => ({ role: row.role, count: Number(row.count) })
        );

    res.json({
      data: {
        enrollmentTrends: enrollmentTrends.map((row) => ({ month: row.month, count: Number(row.count) })),
        classesByDepartment: classesByDepartment.map((row) => ({
          department: row.department,
          count: Number(row.count),
        })),
        capacityStatus: [
          { status: "available", count: buckets.available },
          { status: "nearFull", count: buckets.nearFull },
          { status: "full", count: buckets.full },
        ],
        userDistribution,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching dashboard charts" });
  }
});

router.get("/activity", async (req, res) => {
  try {
    const isTeacher = req.user!.role === "teacher";
    const teacherId = isTeacher ? await resolveTeacherId(req.user!.id) : undefined;
    const classScope = isTeacher ? eq(classes.teacherId, teacherId ?? -1) : undefined;

    const recentEnrollmentsRaw = await db
      .select({
        id: enrollments.id,
        label: user.name,
        detail: classes.name,
        timestamp: enrollments.enrolledAt,
      })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .innerJoin(students, eq(enrollments.studentId, students.id))
      .innerJoin(user, eq(students.userId, user.id))
      .where(classScope)
      .orderBy(desc(enrollments.enrolledAt))
      .limit(15);

    const recentClassesRaw = await db
      .select({ id: classes.id, label: classes.name, timestamp: classes.createdAt })
      .from(classes)
      .where(classScope)
      .orderBy(desc(classes.createdAt))
      .limit(15);

    const recentUsersRaw = isTeacher
      ? []
      : await db
          .select({ id: user.id, label: user.name, detail: user.role, timestamp: user.createdAt })
          .from(user)
          .orderBy(desc(user.createdAt))
          .limit(15);

    const activity: ActivityRow[] = [
      ...recentEnrollmentsRaw.map((row) => ({
        type: "enrollment" as const,
        id: row.id,
        label: row.label,
        detail: `enrolled in ${row.detail}`,
        timestamp: row.timestamp,
      })),
      ...recentClassesRaw.map((row) => ({
        type: "class_created" as const,
        id: row.id,
        label: row.label,
        detail: "class created",
        timestamp: row.timestamp,
      })),
      ...recentUsersRaw.map((row) => ({
        type: "user_created" as const,
        id: row.id,
        label: row.label,
        detail: `joined as ${row.detail}`,
        timestamp: row.timestamp,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 15);

    res.json({ data: activity });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching activity feed" });
  }
});

export default router;
