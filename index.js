const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

//middleware
app.use(express.json());
app.use(cors());

const verifyToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "forbidden access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

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
    const selectedEmployeeCollection = database.collection(
      "selectedEmployeeCollection"
    );
    const hrCollection = database.collection("hrCollection");
    const assetCollection = database.collection("assetCollection");

    //! jwt related
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "365d",
      });
      res.send({ token });
    });

    //! Employee related api
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

    app.get("/all-employees", async (req, res) => {
      const result = await employeeCollection.find().toArray();
      res.send(result);
    });

    //! HR-related API
    app.get("/detailsOf/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email };

        // Check if the user is in the HR collection
        const hrDetails = await hrCollection.findOne(query);
        if (hrDetails) {
          return res.status(200).send(hrDetails);
        }

        // Check if the user is in the Employee collection
        const employeeDetails = await employeeCollection.findOne(query);
        if (employeeDetails) {
          return res.status(200).send(employeeDetails);
        }

        // If no match is found
        return res.status(404).send({ message: "User not found" });
      } catch (error) {
        console.error("Error fetching role:", error);
        res.status(500).send({ message: "Internal server error" });
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

    //Add Asset Request
    app.post("/add-asset", verifyToken, async (req, res) => {
      const data = req.body;
      const result = await assetCollection.insertOne(data);
      res.send(result);
    });

    //Get All Assets Api
    app.get("/all-asset", verifyToken, async (req, res) => {
      const result = await assetCollection.find().toArray();
      res.send(result);
    });

    //Delete Asset Api
    app.delete(`/delete-asset/:id`, verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await assetCollection.deleteOne(query);
      res.send(result);
    });

    //!payment Intent
    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;
      const paymentAmount = parseInt(amount * 100); // Stripe
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: paymentAmount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send({ error: "Failed to create payment intent" });
      }
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
