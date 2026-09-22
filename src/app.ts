import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import subjectsRouter from "./routes/subjects.js";
import departmentsRouter from "./routes/departments.js";
import uploadsRouter from "./routes/uploads.js";
import classesRouter from "./routes/classes.js";
import enrollmentsRouter from "./routes/enrollments.js";
import usersRouter from "./routes/users.js";
import teachersRouter from "./routes/teachers.js";
import studentsRouter from "./routes/students.js";
import cors from "cors";
import securityMiddleware from "./middleware/security.js";
import { frontendOrigins } from "./lib/frontend-origins.js";

const app = express();

app.use(cors({
  origin: frontendOrigins,
  methods:['GET','POST','PUT','DELETE'],
  credentials:true
}))

// Better Auth needs the raw request body, so its handler is mounted before
// express.json() and matched against every path it owns.
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.use(securityMiddleware);

app.use("/api/subjects", subjectsRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/classes", classesRouter);
app.use("/api/enrollments", enrollmentsRouter);
app.use("/api/users", usersRouter);
app.use("/api/teachers", teachersRouter);
app.use("/api/students", studentsRouter);

export default app;
