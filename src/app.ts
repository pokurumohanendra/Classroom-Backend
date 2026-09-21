import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import subjectsRouter from "./routes/subjects";
import departmentsRouter from "./routes/departments";
import uploadsRouter from "./routes/uploads";
import classesRouter from "./routes/classes";
import enrollmentsRouter from "./routes/enrollments";
import usersRouter from "./routes/users";
import teachersRouter from "./routes/teachers";
import studentsRouter from "./routes/students";
import cors from "cors";
import securityMiddleware from "./middleware/security";

const app = express();

if (!process.env.FRONTEND_URL) throw new Error('FRONTEND_URL is not set in .env file')
app.use(cors({
  origin: process.env.FRONTEND_URL,
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
