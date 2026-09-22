import express from "express";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { sql, and, eq, ilike } from "drizzle-orm";
import { user, roleEnum } from "../schema/auth.js";
import { auth } from "../lib/auth.js";
import { requireAuth, requireRole } from "../middleware/require-auth.js";

const router = express.Router();

router.use(requireAuth, requireRole("admin"));

router.get("/", async (req, res) => {
  try {
    const { role, search, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];
    if (typeof role === "string" && (roleEnum.enumValues as readonly string[]).includes(role)) {
      filterConditions.push(eq(user.role, role as (typeof roleEnum.enumValues)[number]));
    }
    if (search) filterConditions.push(ilike(user.name, `%${search}%`));
    const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(user).where(whereClause);
    const totalCount = countResult[0]?.count || 0;

    const usersList = await db.select().from(user).where(whereClause).limit(limitPerPage).offset(offset);

    res.json({
      data: usersList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching users" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [result] = await db.select().from(user).where(eq(user.id, req.params.id));
    if (!result) return res.status(404).json({ error: "User not found" });
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while fetching user" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: "name, email and role are required" });
    }

    // Better Auth requires a password for email/password accounts; the admin
    // gets a one-time temporary password back to share with the new user.
    const temporaryPassword = crypto.randomBytes(9).toString("base64url");

    const signUpResult = await auth.api.signUpEmail({
      body: { name, email, password: temporaryPassword, role },
    });

    res.status(201).json({
      data: signUpResult.user,
      message: `User created. Temporary password: ${temporaryPassword}`,
    });
  } catch (err: any) {
    if (err?.body?.code === "USER_ALREADY_EXISTS" || err?.status === 422) {
      return res.status(409).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: "Error occurred while creating user" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { name, email, role, emailVerified, image, imageCldPubId } = req.body;

    const [updated] = await db
      .update(user)
      .set({ name, email, role, emailVerified, image, imageCldPubId, updatedAt: new Date() })
      .where(eq(user.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: "User not found" });
    res.json({ data: updated });
  } catch (err: any) {
    if ((err?.cause?.code ?? err?.code) === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: "Error occurred while updating user" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const [deleted] = await db.delete(user).where(eq(user.id, req.params.id)).returning({ id: user.id });
    if (!deleted) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while deleting user" });
  }
});

export default router;
