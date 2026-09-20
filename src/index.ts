import express from "express";
import subjectsRouter from "./routes/subjects";
import cors from "cors";
const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods:['GET','POST','PUT','DELETE'],
  credentials:true
}))
app.use(express.json());

app.use("/api/subjects", subjectsRouter);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
