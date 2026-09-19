import express from "express";

const app = express();
const PORT = 8000;

app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Classroom backend is running");
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
