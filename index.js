const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 5000;

//middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kgmqz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = client.db("ProTracker");
    const employeeCollection = database.collection("employeeCollection");
    const hrCollection = database.collection("hrCollection");

    //jwt related
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "365d",
      });
      res.send({ token });
    });

    //employee related api
    app.post("/add-employee", async (req, res) => {
      const employeeInfo = req.body;
      const email = employeeInfo.email;
      const existingEmployee = await employeeCollection.findOne({
        email: email,
      });
      if (existingEmployee) {
        return res.send({
          message: "Employee with this email already exists.",
        });
      }
      const result = await employeeCollection.insertOne(employeeInfo);
      res.send(result);
    });

    //hr related api
    // HR-related API
    app.get("/users/hr/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email: email };

        const result = await hrCollection.findOne(query);

        if (result) {
          return res.json({ hr: true, message: "User is an HR" });
        } else {
          return res.json({ hr: false, message: "User is not an HR" });
        }
      } catch (error) {
        console.error("Error checking HR status:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.post("/add-hr", async (req, res) => {
      const employeeInfo = req.body;
      const email = employeeInfo.email;
      const existingHR = await hrCollection.findOne({
        email: email,
      });
      if (existingHR) {
        return res.send({
          message: "Employee with this email already exists.",
        });
      }
      const result = await hrCollection.insertOne(employeeInfo);
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// app.get("/", async (req, res) => {
//   res.send("a12 over and out");
// });

app.listen(port, () => {
  console.log(`a12 server is running on http://localhost:${port}`);
});
