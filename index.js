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

    //! HR-related API
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

    //Add Asset Request
    app.post("/add-asset", async (req, res) => {
      const data = req.body;
      const result = await assetCollection.insertOne(data);
      res.send(result);
    });

    //Get All Assets Api
    app.get("/all-asset", async (req, res) => {
      const result = await assetCollection.find().toArray();
      res.send(result);
    });

    //Delete Asset Api
    app.delete(`/delete-asset/:id`, async (req, res) => {
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
