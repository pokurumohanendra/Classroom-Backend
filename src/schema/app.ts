import { pgTable, integer, varchar, timestamp, text, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm/relations';
import { user } from './auth.js';

const timestamps = {
   createdAt: timestamp('created_at').defaultNow().notNull(),
updateAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),};


export const departments = pgTable('departments', {
  id: integer ('id').primaryKey().generatedAlwaysAsIdentity(),
 code:varchar('code', { length: 10 }).notNull().unique(),
 name:varchar('name', { length: 100 }).notNull(),
 description:varchar('description', { length: 255 }),
 ...timestamps
});
export const subjects = pgTable('subjects', {
  id: integer ('id').primaryKey().generatedAlwaysAsIdentity(),
 departmentId: integer('department_id').notNull().references(() => departments.id, { onDelete: 'restrict' }),
 name: varchar('name', { length: 100 }).notNull(),
  code:varchar('code', { length: 10 }).notNull().unique(),
 description: varchar('description', { length: 255 }),
 ...timestamps
});

// Profile tables linking a Better Auth user to a role-specific record. Class
// and Enrollments reference these (not `user` directly), per the ER diagram --
// keeps room for teacher/student-only fields later without touching Class/
// Enrollments' foreign keys.
export const teachers = pgTable('teachers', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }).unique(),
  ...timestamps,
});

export const students = pgTable('students', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }).unique(),
  ...timestamps,
});

export const classes = pgTable('classes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 255 }).notNull(),
  inviteCode: varchar('invite_code', { length: 20 }).notNull().unique(),
  subjectId: integer('subject_id').notNull().references(() => subjects.id, { onDelete: 'restrict' }),
  teacherId: integer('teacher_id').notNull().references(() => teachers.id, { onDelete: 'restrict' }),
  description: varchar('description', { length: 255 }),
  bannerUrl: text('banner_url'),
  bannerCldPubId: text('banner_cld_pub_id'),
  capacity: integer('capacity').notNull().default(50),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  ...timestamps,
});

export const enrollments = pgTable('enrollments', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  classId: integer('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  studentId: integer('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  unique('enrollments_class_student_unique').on(table.classId, table.studentId),
]);

// One department has many subjects
export const departmentRelations = relations(departments, ({many}) => ({
  subjects: many(subjects, { relationName: 'department_subjects' }),
}))

// Each subject belongs to one department
export const subjectRelations = relations(subjects, ({one, many}) => ({
  department: one(departments, {
    fields: [subjects.departmentId],
    references: [departments.id],
    relationName: 'department_subjects',
  }),
  classes: many(classes, { relationName: 'subject_classes' }),
}))

export const teacherRelations = relations(teachers, ({one, many}) => ({
  user: one(user, {
    fields: [teachers.userId],
    references: [user.id],
  }),
  classes: many(classes, { relationName: 'teacher_classes' }),
}))

export const studentRelations = relations(students, ({one, many}) => ({
  user: one(user, {
    fields: [students.userId],
    references: [user.id],
  }),
  enrollments: many(enrollments, { relationName: 'student_enrollments' }),
}))

export const classRelations = relations(classes, ({one, many}) => ({
  subject: one(subjects, {
    fields: [classes.subjectId],
    references: [subjects.id],
    relationName: 'subject_classes',
  }),
  teacher: one(teachers, {
    fields: [classes.teacherId],
    references: [teachers.id],
    relationName: 'teacher_classes',
  }),
  enrollments: many(enrollments, { relationName: 'class_enrollments' }),
}))

export const enrollmentRelations = relations(enrollments, ({one}) => ({
  class: one(classes, {
    fields: [enrollments.classId],
    references: [classes.id],
    relationName: 'class_enrollments',
  }),
  student: one(students, {
    fields: [enrollments.studentId],
    references: [students.id],
    relationName: 'student_enrollments',
  }),
}))

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
export type Teacher = typeof teachers.$inferSelect;
export type NewTeacher = typeof teachers.$inferInsert;
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;
export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
