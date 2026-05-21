import express from "express";
import cors from "cors";
import path from "path";
import { spotRouter } from "./routes/spot";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", spotRouter);

// Serve React frontend in production
const clientBuild = path.join(__dirname, "../client/build");
const fs = require("fs");
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(clientBuild, "index.html"));
  });
}

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
