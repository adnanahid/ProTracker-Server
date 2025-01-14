const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(express.json());
app.use(cors());

app.get("/", async (req, res) => {
  res.send("a12 over and out");
});

app.listen(port, () => {
  console.log(`a12 server is running on http://localhost:${port}`);
});
 